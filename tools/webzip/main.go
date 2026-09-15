// Збірка для itch.io: zip, у корені якого лежить index.html.
//
//	go run ./tools/webzip        →  dist/Ferit-9-web.zip
//
// Itch віддає вміст архіву як статику в <iframe>, тож усе має бути
// відносними шляхами й без жодного сервера. Гра це вже вміє: лаунчер на Go
// нічого не домішує в саму сторінку, крім пульсу, а тут пульс не потрібен.
//
// Що робить збірник:
//   - склеює скрипти з index.html в один bundle.js у тому ж порядку,
//     в якому вони підключені (список береться зі сторінки, тож розійтися
//     з нею не може);
//   - перемикає шрифти на локальні, якщо в fonts/ реально лежать .woff2;
//   - кладе index.html у корінь архіву — цього вимагає itch.
//
// Мініфікації тут нема: вона живе в Node-збірнику (tools/build-app.js).
// Для веба це й не рятує — код усе одно віддається браузеру як є.
package main

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	outName  = "Ferit-9-web.zip"
	distDir  = "dist"
	bundleJS = "bundle.js"
)

var (
	reScript     = regexp.MustCompile(`\n?[ \t]*<script src="(js/[^"]+)"></script>`)
	rePreconnect = regexp.MustCompile(`\n?[ \t]*<link rel="preconnect"[^>]*>`)
	reGoogleCSS  = regexp.MustCompile(`<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>`)
)

func main() {
	root, err := repoRoot()
	check(err)

	html, err := os.ReadFile(filepath.Join(root, "index.html"))
	check(err)
	page := string(html)

	// 1. Порядок склейки диктує сама сторінка.
	scripts := reScript.FindAllStringSubmatch(page, -1)
	if len(scripts) == 0 {
		check(fmt.Errorf("в index.html не знайдено жодного <script src=\"js/…\">"))
	}
	bundle, srcBytes, err := concat(root, scripts)
	check(err)

	// 2. Один скрипт замість десятка.
	page = reScript.ReplaceAllString(page, "")
	page = strings.Replace(page, "</body>",
		`<script src="`+bundleJS+`"></script>`+"\n</body>", 1)

	// 3. Шрифти: локальні, якщо є; інакше лишаємо Google Fonts — itch онлайн.
	fontFiles, err := localFonts(root)
	check(err)
	if len(fontFiles) > 0 {
		page = rePreconnect.ReplaceAllString(page, "")
		page = reGoogleCSS.ReplaceAllString(page,
			`<link rel="stylesheet" href="fonts/fonts.css">`)
		fmt.Printf("шрифти · вшито локально (%d файлів)\n", len(fontFiles))
	} else {
		fmt.Println("шрифти · тягнуться з Google Fonts; вшити локально: node tools/fetch-fonts.js")
	}

	// 4. Архів.
	check(os.MkdirAll(filepath.Join(root, distDir), 0o755))
	outPath := filepath.Join(root, distDir, outName)

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	check(addBytes(zw, "index.html", []byte(page)))
	check(addBytes(zw, bundleJS, bundle))
	check(addFile(zw, root, "style.css", "style.css"))
	check(addFile(zw, root, "icon.png", "icon.png"))
	for _, f := range fontFiles {
		check(addFile(zw, root, path.Join("fonts", f), path.Join("fonts", f)))
	}
	check(zw.Close())
	check(os.WriteFile(outPath, buf.Bytes(), 0o644))

	fmt.Printf("готово: %s/%s · %d скриптів → %d КБ bundle.js · архів %d КБ\n",
		distDir, outName, len(scripts), srcBytes/1024, buf.Len()/1024)
	fmt.Println("заливати на itch.io як «HTML» з галочкою «This file will be played in the browser»")
}

// concat склеює скрипти в порядку підключення, лишаючи мітку файлу —
// в стектрейсі з бандла видно, звідки рядок.
func concat(root string, scripts [][]string) ([]byte, int, error) {
	var b bytes.Buffer
	for _, m := range scripts {
		rel := m[1]
		src, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel)))
		if err != nil {
			return nil, 0, fmt.Errorf("%s: %w", rel, err)
		}
		b.WriteString("\n;/* " + rel + " */\n")
		b.Write(src)
	}
	return b.Bytes(), b.Len(), nil
}

// localFonts повертає вміст fonts/, якщо там є хоч один .woff2.
func localFonts(root string) ([]string, error) {
	entries, err := os.ReadDir(filepath.Join(root, "fonts"))
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var names []string
	var hasWoff bool
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		names = append(names, e.Name())
		if strings.HasSuffix(strings.ToLower(e.Name()), ".woff2") {
			hasWoff = true
		}
	}
	if !hasWoff {
		return nil, nil
	}
	return names, nil
}

func addBytes(zw *zip.Writer, name string, data []byte) error {
	w, err := zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate})
	if err != nil {
		return err
	}
	_, err = w.Write(data)
	return err
}

func addFile(zw *zip.Writer, root, rel, name string) error {
	f, err := os.Open(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		return err
	}
	defer f.Close()
	w, err := zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate})
	if err != nil {
		return err
	}
	_, err = io.Copy(w, f)
	return err
}

// repoRoot дозволяє запускати збірник і з кореня, і з теки самого збірника.
func repoRoot() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for dir := wd; ; {
		if _, err := os.Stat(filepath.Join(dir, "index.html")); err == nil {
			return dir, nil
		}
		up := filepath.Dir(dir)
		if up == dir {
			return "", fmt.Errorf("не знайдено index.html — запускати з кореня проєкту")
		}
		dir = up
	}
}

func check(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "збірка впала:", err)
		os.Exit(1)
	}
}
