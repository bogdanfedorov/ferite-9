APP      := Ferit-9
DIST     := dist
GOFLAGS  := -trimpath
LDWIN    := -s -w -H windowsgui
LDNIX    := -s -w

.PHONY: all run windows linux web fonts icon clean help

help:
	@echo "make run"
	@echo "make windows  - $(DIST)/$(APP).exe"
	@echo "make linux    - $(DIST)/$(APP)"
	@echo "make web      - $(DIST)/$(APP)-web.zip for itch.io"
	@echo "make all      - windows + linux"
	@echo "make fonts    - need Node + internet"
	@echo "make icon     - add iccon to exe (need goversioninfo)"

run:
	go run .

$(DIST):
	mkdir -p $(DIST)

windows: | $(DIST)
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
		go build $(GOFLAGS) -ldflags "$(LDWIN)" -o $(DIST)/$(APP).exe .
	@echo "готово: $(DIST)/$(APP).exe"

linux: | $(DIST)
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
		go build $(GOFLAGS) -ldflags "$(LDNIX)" -o $(DIST)/ferit-9 .
	@echo "готово: $(DIST)/ferit-9"

web: | $(DIST)
	go run ./tools/webzip

all: windows linux

fonts:
	node tools/fetch-fonts.js

#go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest
icon:
	goversioninfo -icon=build/icon.ico -o resource_windows_amd64.syso
	@echo "resource_windows_amd64.syso створено — тепер make windows"

clean:
	rm -rf $(DIST) resource_windows_amd64.syso
