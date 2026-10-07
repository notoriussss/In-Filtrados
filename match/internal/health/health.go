package health

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type Response struct {
	Status  string            `json:"status"`
	Service string            `json:"service"`
	Checks  map[string]string `json:"checks"`
}

type Checker interface {
	CheckDB(ctx context.Context) error
	CheckRabbitMQ(ctx context.Context) error
}

type DefaultChecker struct{}

func (c *DefaultChecker) CheckDB(ctx context.Context) error {
	dbUrl := os.Getenv("MATCH_DB_URL")
	if dbUrl == "" {
		return fmt.Errorf("MATCH_DB_URL not set")
	}
	hostPort := extractHostPort(dbUrl, "localhost:5432")
	return pingTCP(ctx, hostPort)
}

func (c *DefaultChecker) CheckRabbitMQ(ctx context.Context) error {
	rabbitUrl := os.Getenv("RABBITMQ_URL")
	if rabbitUrl == "" {
		rabbitUrl = "amqp://guest:guest@localhost:5672/"
	}
	hostPort := extractHostPort(rabbitUrl, "localhost:5672")
	return pingTCP(ctx, hostPort)
}

func extractHostPort(rawUrl, defaultAddr string) string {
	s := rawUrl
	if idx := strings.Index(s, "://"); idx != -1 {
		s = s[idx+3:]
	}
	if idx := strings.Index(s, "@"); idx != -1 {
		s = s[idx+1:]
	}
	if idx := strings.Index(s, "/"); idx != -1 {
		s = s[:idx]
	}
	if idx := strings.Index(s, "?"); idx != -1 {
		s = s[:idx]
	}
	if s == "" {
		return defaultAddr
	}
	if !strings.Contains(s, ":") {
		return s + ":5432"
	}
	return s
}

func pingTCP(ctx context.Context, addr string) error {
	var d net.Dialer
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return err
	}
	conn.Close()
	return nil
}

type Handler struct {
	Checker Checker
}

func NewHandler(checker Checker) *Handler {
	if checker == nil {
		checker = &DefaultChecker{}
	}
	return &Handler{Checker: checker}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	checks := make(map[string]string)
	var mu sync.Mutex
	var wg sync.WaitGroup

	runCheck := func(name string, checkFn func(ctx context.Context) error) {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), 1*time.Second)
		defer cancel()

		err := checkFn(ctx)
		mu.Lock()
		defer mu.Unlock()
		if err != nil {
			checks[name] = fmt.Sprintf("fail: %v", err)
		} else {
			checks[name] = "ok"
		}
	}

	wg.Add(2)
	go runCheck("db", h.Checker.CheckDB)
	go runCheck("rabbitmq", h.Checker.CheckRabbitMQ)
	wg.Wait()

	isDegraded := false
	for _, val := range checks {
		if val != "ok" {
			isDegraded = true
			break
		}
	}

	status := "ok"
	statusCode := http.StatusOK
	if isDegraded {
		status = "degraded"
		statusCode = http.StatusServiceUnavailable
	}

	resp := Response{
		Status:  status,
		Service: "match",
		Checks:  checks,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(resp)
}
