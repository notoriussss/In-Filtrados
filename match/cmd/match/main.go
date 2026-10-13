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
	"strconv"
	"syscall"
	"time"

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

// restoreTimeout limita la lectura de instantáneas al arrancar.
const restoreTimeout = 5 * time.Second

// defaultGraceSeconds es el periodo de gracia sin RECONNECT_GRACE_SECONDS.
const defaultGraceSeconds = 90

func main() {
	httpPort := getenv("HTTP_PORT", "8081")
	grpcPort := getenv("GRPC_PORT", "50051")
	mapPath := getenv("MAP_PATH", "../shared/map.json")
	dbURL := os.Getenv("MATCH_DB_URL")
	rabbitURL := os.Getenv("RABBITMQ_URL")
	grace := graceFromEnv(os.Getenv("RECONNECT_GRACE_SECONDS"))

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
	reg := room.NewRegistry()
	// Sala fija DEV mientras web no crea salas (S1-16 y S1-18 la quitan).
	dev := room.NewRoom("DEV", "DEV", m)
	reg.Add(dev)
	go dev.Run(ctx)

	store := matchdb.NewStore(pool)
	eventLog := matchdb.NewEventLogWriter(pool)
	go eventLog.Run(ctx)
	snapshots := matchdb.NewSnapshotWriter(pool)
	go snapshots.Run(ctx)
	serverOpts := []matchgrpc.ServerOption{
		matchgrpc.WithStore(store),
		matchgrpc.WithEventLog(eventLog),
		matchgrpc.WithGracePeriod(grace),
		matchgrpc.WithSnapshots(snapshots),
	}
	if publisher != nil {
		// S3-03: lo que RabbitMQ no confirme espera en la tabla outbox.
		outbox := events.NewOutboxPublisher(
			publisher,
			matchdb.NewOutboxStore(pool),
		)
		go outbox.Run(ctx)
		serverOpts = append(serverOpts, matchgrpc.WithPublisher(outbox))
	}

	lis, err := net.Listen("tcp", ":"+grpcPort)
	if err != nil {
		log.Fatalf("grpc listen: %v", err)
	}
	server := matchgrpc.NewServer(reg, m, serverOpts...)
	// S3-02: las partidas sin terminar vuelven antes de aceptar streams,
	// así el primer Join de cada jugador ya encuentra su sala.
	restoreRooms(ctx, store, server)

	grpcServer := grpc.NewServer()
	matchv1.RegisterMatchServer(grpcServer, server)
	go func() {
		log.Printf("match gRPC listening on :%s", grpcPort)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("grpc serve: %v", err)
		}
	}()

	mux := http.NewServeMux()
	mux.Handle("/health", health.NewHandler(health.NewPoolChecker(pool)))
	httpServer := &http.Server{Addr: ":" + httpPort, Handler: mux}
	go func() {
		log.Printf("match HTTP listening on :%s", httpPort)
		if err := httpServer.ListenAndServe(); err != nil &&
			err != http.ErrServerClosed {
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

// restoreRooms lee las instantáneas de las partidas sin terminar. Si la
// base no responde, match arranca igual, sin esas partidas.
func restoreRooms(
	ctx context.Context,
	store *matchdb.Store,
	server *matchgrpc.Server,
) {
	readCtx, cancel := context.WithTimeout(ctx, restoreTimeout)
	defer cancel()
	saved, err := store.UnfinishedSnapshots(readCtx)
	if err != nil {
		log.Printf("restore: %v", err)
		return
	}
	n := server.RestoreRooms(ctx, saved)
	log.Printf("restore: %d partida(s) recuperada(s)", n)
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

// graceFromEnv lee RECONNECT_GRACE_SECONDS (S3-01). Vacía o inválida,
// usa los 90 s de docs/tasks.md; el laboratorio usa 600.
func graceFromEnv(raw string) time.Duration {
	if raw == "" {
		return defaultGraceSeconds * time.Second
	}
	seconds, err := strconv.Atoi(raw)
	if err != nil || seconds <= 0 {
		log.Printf(
			"RECONNECT_GRACE_SECONDS=%q no es válido; se usan %d s",
			raw,
			defaultGraceSeconds,
		)
		return defaultGraceSeconds * time.Second
	}
	return time.Duration(seconds) * time.Second
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
