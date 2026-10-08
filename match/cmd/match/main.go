package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	matchgrpc "github.com/notoriussss/in-filtrados/match/internal/grpc"
	"github.com/notoriussss/in-filtrados/match/internal/health"
	"github.com/notoriussss/in-filtrados/match/internal/room"
)

func main() {
	httpPort := getenv("HTTP_PORT", "8081")
	grpcPort := getenv("GRPC_PORT", "50051")
	mapPath := getenv("MAP_PATH", "../shared/map.json")

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	m, err := room.LoadMap(mapPath)
	if err != nil {
		log.Fatalf("map: %v", err)
	}
	// S1-07: one fixed room called DEV. S1-09 replaces it with CreateRoom and JoinRoom.
	dev := room.New("DEV", m)
	go dev.Run(ctx)

	lis, err := net.Listen("tcp", ":"+grpcPort)
	if err != nil {
		log.Fatalf("grpc listen: %v", err)
	}
	grpcServer := grpc.NewServer()
	matchv1.RegisterMatchServer(grpcServer, matchgrpc.NewServer(dev))
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
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
