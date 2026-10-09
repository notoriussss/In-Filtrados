package main

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/golang-migrate/migrate/v4"
	migratepgx "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"google.golang.org/grpc"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	matchdb "github.com/notoriussss/in-filtrados/match/internal/db"
	"github.com/notoriussss/in-filtrados/match/internal/events"
	matchgrpc "github.com/notoriussss/in-filtrados/match/internal/grpc"
	"github.com/notoriussss/in-filtrados/match/internal/health"
	"github.com/notoriussss/in-filtrados/match/internal/room"
)

// migrationsDir es relativa al directorio de trabajo: `match/` en local y
// `/app` en la imagen (el Dockerfile copia las migraciones ahí).
const migrationsDir = "migrations"

func main() {
	httpPort := getenv("HTTP_PORT", "8081")
	grpcPort := getenv("GRPC_PORT", "50051")
	mapPath := getenv("MAP_PATH", "../shared/map.json")
	dbURL := os.Getenv("MATCH_DB_URL")
	rabbitURL := os.Getenv("RABBITMQ_URL")

	ctx, stop := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer stop()

	if err := runMigrations(dbURL); err != nil {
		log.Fatalf("migraciones: %v", err)
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("match-db: %v", err)
	}
	defer pool.Close()

	publisher := newPublisher(rabbitURL)

	m, err := room.LoadMap(mapPath)
	if err != nil {
		log.Fatalf("load map %s: %v", mapPath, err)
	}
	// S1-09: CreateRoom crea las salas dinámicamente; no hay sala fija.
	reg := room.NewRegistry()
	// Sala fija DEV mientras web no crea salas (S1-16 y S1-18 la quitan).
	dev := room.NewRoom("DEV", "DEV", m)
	reg.Add(dev)
	go dev.Run(ctx)

	store := matchdb.NewStore(pool)
	serverOpts := []matchgrpc.ServerOption{matchgrpc.WithStore(store)}
	if publisher != nil {
		serverOpts = append(serverOpts, matchgrpc.WithPublisher(publisher))
	}

	lis, err := net.Listen("tcp", ":"+grpcPort)
	if err != nil {
		log.Fatalf("grpc listen: %v", err)
	}
	grpcServer := grpc.NewServer()
	matchv1.RegisterMatchServer(
		grpcServer,
		matchgrpc.NewServer(reg, m, serverOpts...),
	)
	go func() {
		log.Printf("match gRPC listening on :%s", grpcPort)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("grpc serve: %v", err)
		}
	}()

	mux := http.NewServeMux()
	mux.Handle("/health", health.NewHandler(nil))
	httpServer := &http.Server{Addr: ":" + httpPort, Handler: mux}
	go func() {
		log.Printf("match HTTP listening on :%s", httpPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http serve: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down")
	grpcServer.Stop()
	_ = httpServer.Shutdown(context.Background())
	if publisher != nil {
		publisher.Close()
	}
}

// runMigrations aplica las migraciones de golang-migrate al arrancar.
func runMigrations(dbURL string) error {
	if dbURL == "" {
		return errors.New("MATCH_DB_URL no está definida")
	}

	sqlDB, err := sql.Open("pgx", dbURL)
	if err != nil {
		return err
	}
	defer sqlDB.Close()

	driver, err := migratepgx.WithInstance(sqlDB, &migratepgx.Config{})
	if err != nil {
		return err
	}

	absPath, err := filepath.Abs(migrationsDir)
	if err != nil {
		return err
	}
	m, err := migrate.NewWithDatabaseInstance("file://"+absPath, "pgx", driver)
	if err != nil {
		return err
	}
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}

// newPublisher arranca el publicador solo si hay RABBITMQ_URL; si RabbitMQ
// está apagado, el publicador reintenta cada 2 segundos por su cuenta.
func newPublisher(rabbitURL string) *events.AMQPPublisher {
	if rabbitURL == "" {
		log.Println("RABBITMQ_URL vacío: no se publicarán eventos")
		return nil
	}
	return events.NewAMQPPublisher(rabbitURL)
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
