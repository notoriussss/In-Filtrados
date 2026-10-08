package health

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type mockChecker struct {
	dbErr     error
	rabbitErr error
}

func (m *mockChecker) CheckDB(ctx context.Context) error {
	return m.dbErr
}

func (m *mockChecker) CheckRabbitMQ(ctx context.Context) error {
	return m.rabbitErr
}

func TestHealthHandler_StatusOK(t *testing.T) {
	handler := NewHandler(&mockChecker{dbErr: nil, rabbitErr: nil})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var resp Response
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Status != "ok" || resp.Service != "match" {
		t.Errorf("unexpected status or service: %+v", resp)
	}
	if resp.Checks["db"] != "ok" || resp.Checks["rabbitmq"] != "ok" {
		t.Errorf("unexpected checks: %+v", resp.Checks)
	}
}

func TestHealthHandler_StatusDegraded(t *testing.T) {
	handler := NewHandler(&mockChecker{dbErr: errors.New("connection refused"), rabbitErr: nil})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", rec.Code)
	}

	var resp Response
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Status != "degraded" {
		t.Errorf("expected degraded status, got %s", resp.Status)
	}
	if resp.Checks["db"] != "fail: connection refused" {
		t.Errorf("unexpected db check value: %s", resp.Checks["db"])
	}
}

func TestDefaultChecker_MissingEnv(t *testing.T) {
	t.Setenv("MATCH_DB_URL", "")
	t.Setenv("RABBITMQ_URL", "")

	checker := &DefaultChecker{}
	ctx := context.Background()

	if err := checker.CheckDB(ctx); err == nil || err.Error() != "MATCH_DB_URL not set" {
		t.Errorf("expected MATCH_DB_URL not set error, got: %v", err)
	}

	if err := checker.CheckRabbitMQ(ctx); err == nil || err.Error() != "RABBITMQ_URL not set" {
		t.Errorf("expected RABBITMQ_URL not set error, got: %v", err)
	}
}
