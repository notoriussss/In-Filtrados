package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/notoriussss/in-filtrados/match/internal/health"
)

func main() {
	port := os.Getenv("HTTP_PORT")
	if port == "" {
		port = "8081"
	}

	healthHandler := health.NewHandler(nil)
	http.Handle("/health", healthHandler)

	fmt.Printf("Match HTTP service listening on port %s...\n", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		fmt.Fprintf(os.Stderr, "HTTP server error: %v\n", err)
		os.Exit(1)
	}
}
