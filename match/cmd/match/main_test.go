package main

import (
	"testing"
	"time"
)

func TestGraceFromEnv(t *testing.T) {
	cases := []struct {
		raw  string
		want time.Duration
	}{
		{"", 90 * time.Second},
		{"600", 10 * time.Minute},
		{"abc", 90 * time.Second},
		{"-5", 90 * time.Second},
	}
	for _, c := range cases {
		if got := graceFromEnv(c.raw); got != c.want {
			t.Errorf("graceFromEnv(%q) = %v, quiero %v", c.raw, got, c.want)
		}
	}
}
