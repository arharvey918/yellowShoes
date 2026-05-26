package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os/exec"
	"strings"
	"testing"
	"time"
)

const (
	apiIntegrationTimeout  = 3 * time.Second
	apiIntegrationInterval = 50 * time.Millisecond
)

// These tests exercise the public HTTP API end-to-end.
// They must remain serial because the server keeps package-level state.

type apiHarness struct {
	server *httptest.Server
	client *http.Client
}

func newAPIHarness(t *testing.T) *apiHarness {
	t.Helper()

	tmpDir = t.TempDir()
	port = "0"
	nrsc5 = ""
	smokeMode = true
	status = &statusStruct{cmdMap: make(map[*exec.Cmd]bool), tagMap: make(map[string]*tagStruct)}

	assetFS, err := fs.Sub(embedFs, staticFs)
	if err != nil {
		t.Fatalf("fs.Sub(embedFs, %q) error = %v", staticFs, err)
	}

	harness := &apiHarness{
		server: httptest.NewServer(newMux(status, assetFS)),
	}
	harness.client = harness.server.Client()

	t.Cleanup(func() {
		harness.client.CloseIdleConnections()
		harness.server.CloseClientConnections()
		status.killAll()
		harness.server.Close()
	})

	return harness
}

func (h *apiHarness) url(path string) string {
	return h.server.URL + path
}

func (h *apiHarness) do(t *testing.T, req *http.Request) *http.Response {
	t.Helper()

	resp, err := h.client.Do(req)
	if err != nil {
		t.Fatalf("client.Do(%q) error = %v", req.URL.String(), err)
	}
	return resp
}

func (h *apiHarness) get(t *testing.T, path string) *http.Response {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, h.url(path), nil)
	if err != nil {
		t.Fatalf("http.NewRequest(%q) error = %v", path, err)
	}
	return h.do(t, req)
}

func (h *apiHarness) getNoRedirect(t *testing.T, path string) *http.Response {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, h.url(path), nil)
	if err != nil {
		t.Fatalf("http.NewRequest(%q) error = %v", path, err)
	}

	client := *h.client
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("client.Do(%q) error = %v", req.URL.String(), err)
	}
	return resp
}

func (h *apiHarness) postForm(t *testing.T, path string, values url.Values) *http.Response {
	t.Helper()

	req, err := http.NewRequest(http.MethodPost, h.url(path), strings.NewReader(values.Encode()))
	if err != nil {
		t.Fatalf("http.NewRequest(%q) error = %v", path, err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return h.do(t, req)
}

func (h *apiHarness) postJSON(t *testing.T, path string, body any) *http.Response {
	t.Helper()

	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("json.Marshal(%q) error = %v", path, err)
	}

	req, err := http.NewRequest(http.MethodPost, h.url(path), bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("http.NewRequest(%q) error = %v", path, err)
	}
	req.Header.Set("Content-Type", "application/json")
	return h.do(t, req)
}

func readText(t *testing.T, resp *http.Response) string {
	t.Helper()
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("io.ReadAll(%q) error = %v", resp.Request.URL.String(), err)
	}
	return string(body)
}

func readJSON(t *testing.T, resp *http.Response, dst any) {
	t.Helper()
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("io.ReadAll(%q) error = %v", resp.Request.URL.String(), err)
	}
	if err := json.Unmarshal(body, dst); err != nil {
		t.Fatalf("json.Unmarshal(%q) error = %v; body = %q", resp.Request.URL.String(), err, string(body))
	}
}

func eventually(t *testing.T, name string, check func() bool) {
	t.Helper()

	deadline := time.Now().Add(apiIntegrationTimeout)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(apiIntegrationInterval)
	}
	t.Fatalf("%s timed out", name)
}

func expectStringField(t *testing.T, payload map[string]any, key, want string) {
	t.Helper()

	got, ok := payload[key].(string)
	if !ok {
		t.Fatalf("payload[%q] type = %T, want string", key, payload[key])
	}
	if got != want {
		t.Errorf("payload[%q] = %q, want %q", key, got, want)
	}
}

func expectBoolField(t *testing.T, payload map[string]any, key string, want bool) {
	t.Helper()

	got, ok := payload[key].(bool)
	if !ok {
		t.Fatalf("payload[%q] type = %T, want bool", key, payload[key])
	}
	if got != want {
		t.Errorf("payload[%q] = %t, want %t", key, got, want)
	}
}

func audioConnections() int {
	status.RLock()
	defer status.RUnlock()
	return status.audioConnections
}

func tagMapLen() int {
	status.RLock()
	defer status.RUnlock()
	return len(status.tagMap)
}

func TestAPIIntegrationStaticRoutes(t *testing.T) {
	// Given a smoke-mode API server with no active playback session.
	harness := newAPIHarness(t)

	// When the client hits the static and status endpoints.
	redirectResp := harness.getNoRedirect(t, "/")
	if redirectResp.StatusCode != http.StatusMovedPermanently {
		t.Errorf("GET / status = %d, want %d", redirectResp.StatusCode, http.StatusMovedPermanently)
	}
	if got := redirectResp.Header.Get("Location"); got != "/main" {
		t.Errorf("GET / Location = %q, want %q", got, "/main")
	}
	redirectResp.Body.Close()

	mainResp := harness.get(t, "/main")
	if mainResp.StatusCode != http.StatusOK {
		t.Errorf("GET /main status = %d, want %d", mainResp.StatusCode, http.StatusOK)
	}
	mainBody := readText(t, mainResp)
	if !strings.Contains(mainBody, "<title>yellowShoes: nrsc5 radio player (HD FM Radio)</title>") {
		t.Errorf("GET /main body missing page title")
	}

	versionResp := harness.get(t, "/getVersion")
	if versionResp.StatusCode != http.StatusOK {
		t.Errorf("GET /getVersion status = %d, want %d", versionResp.StatusCode, http.StatusOK)
	}
	versionBody := strings.TrimSpace(readText(t, versionResp))
	if versionBody != version {
		t.Errorf("GET /getVersion body = %q, want %q", versionBody, version)
	}

	activeResp := harness.get(t, "/whatsGoinOn")
	if activeResp.StatusCode != http.StatusOK {
		t.Errorf("GET /whatsGoinOn status = %d, want %d", activeResp.StatusCode, http.StatusOK)
	}
	activeBody := strings.TrimSpace(readText(t, activeResp))

	// Then the API returns the expected redirect, embedded page, version, and idle-session response.
	if activeBody != "No_Active_Tags" {
		t.Errorf("GET /whatsGoinOn body = %q, want %q", activeBody, "No_Active_Tags")
	}
}

func TestAPIIntegrationValidateBookmark(t *testing.T) {
	// Given a smoke-mode API server.
	harness := newAPIHarness(t)

	tests := []struct {
		name       string
		values     url.Values
		wantStatus bool
		wantName   string
	}{
		{
			name: "valid-bookmark",
			values: url.Values{
				"bFreq":   {"88.5"},
				"bProg":   {"1"},
				"bukName": {"Test Station"},
			},
			wantStatus: true,
			wantName:   "Test Station",
		},
		{
			name: "invalid-frequency",
			values: url.Values{
				"bFreq":   {"87.9"},
				"bProg":   {"1"},
				"bukName": {"Test Station"},
			},
			wantStatus: false,
		},
		{
			name: "invalid-bookmark-name",
			values: url.Values{
				"bFreq":   {"88.5"},
				"bProg":   {"1"},
				"bukName": {"Bad<Name"},
			},
			wantStatus: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// When the client posts bookmark validation input.
			resp := harness.postForm(t, "/valBookMark", tt.values)
			if resp.StatusCode != http.StatusOK {
				t.Errorf("POST /valBookMark status = %d, want %d", resp.StatusCode, http.StatusOK)
			}

			var payload map[string]any
			readJSON(t, resp, &payload)

			// Then the API reports whether the bookmark input is accepted.
			expectBoolField(t, payload, "status", tt.wantStatus)
			if !tt.wantStatus {
				return
			}

			expectStringField(t, payload, "bFreq", tt.values.Get("bFreq"))
			expectStringField(t, payload, "Prog", tt.values.Get("bProg"))
			expectStringField(t, payload, "bukName", tt.wantName)
		})
	}
}

func TestAPIIntegrationSettingsRoundTrip(t *testing.T) {
	// Given a smoke-mode API server and a valid settings payload.
	harness := newAPIHarness(t)

	payload := map[string]string{
		"rtlTCP":              "none",
		"playerTimeout":       "30000",
		"streamingFormat":     "wav",
		"freq=88.5&program=0": "Morning Jazz",
	}

	// When the client exports settings to a Lace artifact and imports that artifact back.
	exportResp := harness.postJSON(t, "/checkSettings", payload)
	if exportResp.StatusCode != http.StatusOK {
		t.Errorf("POST /checkSettings status = %d, want %d", exportResp.StatusCode, http.StatusOK)
	}

	var exported map[string]any
	readJSON(t, exportResp, &exported)

	expectBoolField(t, exported, "status", true)
	expectStringField(t, exported, "rtlTCP", payload["rtlTCP"])
	expectStringField(t, exported, "playerTimeout", payload["playerTimeout"])
	expectStringField(t, exported, "streamingFormat", payload["streamingFormat"])
	expectStringField(t, exported, "freq=88.5&program=0", payload["freq=88.5&program=0"])

	laceKey, ok := exported["lace"].(string)
	if !ok || laceKey == "" {
		t.Fatalf("POST /checkSettings lace = %v, want non-empty string", exported["lace"])
	}

	importResp := harness.postForm(t, "/import", url.Values{"laceKey": {laceKey}})
	if importResp.StatusCode != http.StatusOK {
		t.Errorf("POST /import status = %d, want %d", importResp.StatusCode, http.StatusOK)
	}

	var imported map[string]any
	readJSON(t, importResp, &imported)

	// Then the round-trip preserves the validated settings payload.
	expectBoolField(t, imported, "status", true)
	expectStringField(t, imported, "rtlTCP", payload["rtlTCP"])
	expectStringField(t, imported, "playerTimeout", payload["playerTimeout"])
	expectStringField(t, imported, "streamingFormat", payload["streamingFormat"])
	expectStringField(t, imported, "freq=88.5&program=0", payload["freq=88.5&program=0"])
}

func TestAPIIntegrationSmokeStreamingLifecycle(t *testing.T) {
	// Given a smoke-mode API server.
	harness := newAPIHarness(t)

	// When the client starts playback, reads metadata, and opens the audio stream.
	streamResp := harness.get(t, "/getStream?freq=88.5&program=1&format=wav")
	if streamResp.StatusCode != http.StatusOK {
		t.Errorf("GET /getStream status = %d, want %d", streamResp.StatusCode, http.StatusOK)
	}
	tag := strings.TrimSpace(readText(t, streamResp))
	if tag == "" {
		t.Fatal("GET /getStream tag = empty, want non-empty tag")
	}

	inactiveResp := harness.get(t, "/whatsGoinOn")
	if inactiveResp.StatusCode != http.StatusOK {
		t.Errorf("GET /whatsGoinOn status = %d, want %d", inactiveResp.StatusCode, http.StatusOK)
	}
	inactiveBody := strings.TrimSpace(readText(t, inactiveResp))
	if inactiveBody != "No_Active_Tags" {
		t.Errorf("GET /whatsGoinOn body = %q, want %q before audio playback", inactiveBody, "No_Active_Tags")
	}

	infoResp := harness.get(t, "/getInfo?tag="+url.QueryEscape(tag))
	if infoResp.StatusCode != http.StatusOK {
		t.Errorf("GET /getInfo status = %d, want %d", infoResp.StatusCode, http.StatusOK)
	}

	var info map[string]any
	readJSON(t, infoResp, &info)

	expectStringField(t, info, "freq", "88.5")
	expectStringField(t, info, "programIndex", "1")
	expectStringField(t, info, "Format", "wav")
	expectStringField(t, info, "Title", "yellowShoes smoke tone")
	expectStringField(t, info, "Station name", "yellowShoes smoke mode")

	audioCtx, cancelAudio := context.WithCancel(context.Background())
	defer cancelAudio()

	audioReq, err := http.NewRequestWithContext(audioCtx, http.MethodGet, harness.url("/getAudio?tag="+url.QueryEscape(tag)), nil)
	if err != nil {
		t.Fatalf("http.NewRequestWithContext(%q) error = %v", tag, err)
	}
	audioResp := harness.do(t, audioReq)
	defer audioResp.Body.Close()

	if audioResp.StatusCode != http.StatusOK {
		t.Errorf("GET /getAudio status = %d, want %d", audioResp.StatusCode, http.StatusOK)
	}
	if got := audioResp.Header.Get("Content-Type"); got != "audio/x-wav" {
		t.Errorf("GET /getAudio Content-Type = %q, want %q", got, "audio/x-wav")
	}

	header := make([]byte, 12)
	if _, err := io.ReadFull(audioResp.Body, header); err != nil {
		t.Fatalf("io.ReadFull(/getAudio) error = %v", err)
	}
	if string(header[:4]) != "RIFF" {
		t.Errorf("GET /getAudio header prefix = %q, want %q", string(header[:4]), "RIFF")
	}

	// Then the API exposes the active session and returns the expected smoke-mode stream details.
	var activeSession map[string]any
	eventually(t, "GET /whatsGoinOn active session", func() bool {
		resp := harness.get(t, "/whatsGoinOn")
		body := strings.TrimSpace(readText(t, resp))
		if body == "" || body == "No_Active_Tags" {
			return false
		}
		if err := json.Unmarshal([]byte(body), &activeSession); err != nil {
			return false
		}
		return activeSession["tag"] == tag && activeSession["freq"] == "88.5"
	})

	cancelAudio()
	audioResp.Body.Close()

	eventually(t, "status audio connection cleanup", func() bool {
		return audioConnections() == 0
	})

	stopResp := harness.get(t, "/stop")
	if stopResp.StatusCode != http.StatusOK {
		t.Errorf("GET /stop status = %d, want %d", stopResp.StatusCode, http.StatusOK)
	}
	stopResp.Body.Close()

	// Then stopping playback clears the live session and tag bookkeeping.
	eventually(t, "GET /whatsGoinOn clears active session", func() bool {
		resp := harness.get(t, "/whatsGoinOn")
		return strings.TrimSpace(readText(t, resp)) == "No_Active_Tags"
	})
	eventually(t, "status tag cleanup", func() bool {
		return tagMapLen() == 0
	})
}
