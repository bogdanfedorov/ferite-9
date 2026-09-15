package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

//go:embed index.html style.css icon.png js fonts
var assets embed.FS

const (
	windowW = 1280
	windowH = 800

	pingPath     = "/_alive"
	pingEvery    = 2 * time.Second
	pingPatience = 12 * time.Second
)

var lastPing atomic.Int64

func main() {
	token := randomToken()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fail("не вдалося зайняти локальний порт: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	url := fmt.Sprintf("http://127.0.0.1:%d/%s/", port, token)

	mux := http.NewServeMux()
	mux.Handle("/"+token+"/", http.StripPrefix("/"+token, gameHandler()))
	srv := &http.Server{Handler: mux}
	go srv.Serve(ln)

	profile, err := os.MkdirTemp("", "ferit9-profile-")
	if err != nil {
		fail("не вдалося створити тимчасовий профіль: %v", err)
	}
	defer os.RemoveAll(profile)

	done := make(chan struct{})

	var stop sync.Once
	quit := func() { stop.Do(func() { close(done) }) }

	cmd, err := openAppWindow(url, profile)
	if err == nil {
		go func() {
			cmd.Wait()
			quit()
		}()
	} else if err2 := openDefaultBrowser(url); err2 != nil {
		fail("не вдалося відкрити вікно гри: %v (%v)", err, err2)
	}

	go watchHeartbeat(quit)

	<-done
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}

func gameHandler() http.Handler {
	files := http.FileServer(http.FS(assets))
	page := indexPage()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == pingPath {
			lastPing.Store(time.Now().UnixMilli())
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write(page)
			return
		}
		files.ServeHTTP(w, r)
	})
}

var (
	rePreconnect = regexp.MustCompile(`\n?\s*<link rel="preconnect"[^>]*>`)
	reGoogleCSS  = regexp.MustCompile(`<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>`)
)

func indexPage() []byte {
	raw, err := assets.ReadFile("index.html")
	if err != nil {
		return []byte("<h1>index.html не знайдено у збірці</h1>")
	}
	html := string(raw)

	if hasLocalFonts() {
		html = rePreconnect.ReplaceAllString(html, "")
		html = reGoogleCSS.ReplaceAllString(html,
			`<link rel="stylesheet" href="fonts/fonts.css">`)
	}

	beat := fmt.Sprintf(
		"\n<script>setInterval(function(){"+
			"fetch(%q,{cache:'no-store'}).catch(function(){});"+
			"},%d);</script>\n",
		strings.TrimPrefix(pingPath, "/"), int(pingEvery/time.Millisecond))

	return []byte(strings.Replace(html, "</body>", beat+"</body>", 1))
}

func hasLocalFonts() bool {
	entries, err := fs.ReadDir(assets, "fonts")
	if err != nil {
		return false
	}
	for _, e := range entries {
		if strings.HasSuffix(strings.ToLower(e.Name()), ".woff2") {
			return true
		}
	}
	return false
}

func openAppWindow(url, profile string) (*exec.Cmd, error) {
	bin := findBrowser()
	if bin == "" {
		return nil, fmt.Errorf("не знайдено Edge, Chrome чи Chromium")
	}
	cmd := exec.Command(bin,
		"--app="+url,
		"--user-data-dir="+profile,
		fmt.Sprintf("--window-size=%d,%d", windowW, windowH),
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-extensions",
		"--disable-sync",
		"--disable-background-networking",
		"--disable-features=Translate,AutofillServerCommunication",
	)
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return cmd, nil
}

func findBrowser() string {
	for _, c := range browserCandidates() {
		if filepath.IsAbs(c) {
			if st, err := os.Stat(c); err == nil && !st.IsDir() {
				return c
			}
			continue
		}
		if p, err := exec.LookPath(c); err == nil {
			return p
		}
	}
	return ""
}

func browserCandidates() []string {
	switch runtime.GOOS {
	case "windows":
		pf := os.Getenv("ProgramFiles")
		pf86 := os.Getenv("ProgramFiles(x86)")
		local := os.Getenv("LOCALAPPDATA")
		return []string{
			filepath.Join(pf86, `Microsoft\Edge\Application\msedge.exe`),
			filepath.Join(pf, `Microsoft\Edge\Application\msedge.exe`),
			filepath.Join(pf, `Google\Chrome\Application\chrome.exe`),
			filepath.Join(pf86, `Google\Chrome\Application\chrome.exe`),
			filepath.Join(local, `Google\Chrome\Application\chrome.exe`),
		}
	case "darwin":
		return []string{
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
		}
	default:
		return []string{
			"google-chrome", "google-chrome-stable", "chromium",
			"chromium-browser", "microsoft-edge", "brave-browser",
		}
	}
}

func openDefaultBrowser(url string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}

func watchHeartbeat(quit func()) {
	tick := time.NewTicker(pingEvery)
	defer tick.Stop()
	for range tick.C {
		last := lastPing.Load()
		if last == 0 {
			continue 
		}
		if time.Since(time.UnixMilli(last)) > pingPatience {
			quit()
			return
		}
	}
}

func randomToken() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

func fail(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	if exe, err := os.Executable(); err == nil {
		log := filepath.Join(filepath.Dir(exe), "ferit9-error.log")
		os.WriteFile(log, []byte(time.Now().Format(time.RFC3339)+"  "+msg+"\n"), 0o644)
	}
	fmt.Fprintln(os.Stderr, msg)
	os.Exit(1)
}
