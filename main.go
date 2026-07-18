//go:build wasip1

// GameAP plugin: game server config editor.
//
// This Go module is a thin WASM shell. All it does is implement the GameAP
// PluginService well enough to (a) identify itself and (b) hand the panel the
// compiled Vue frontend bundle. The actual editor logic (per-game formats and
// schemas) lives in ./frontend.
//
// The host (GameAP) reads and writes the files for us — see the frontend's
// file-editor registration — so this backend needs no filesystem or
// server-control host calls.
package main

import (
	"context"
	_ "embed"

	pluginproto "github.com/gameap/gameap/pkg/plugin/proto"
	"github.com/gameap/gameap/pkg/plugin/sdk"
)

//go:embed frontend/dist/plugin.js
var frontendBundle []byte

//go:embed frontend/dist/plugin.css
var frontendStyles []byte

func main() {}

func init() {
	pluginproto.RegisterPluginService(&GameConfigPlugin{})
}

// GameConfigPlugin embeds EmptyPluginService so we only override the two
// methods we care about; everything else gets a no-op default.
type GameConfigPlugin struct {
	*sdk.EmptyPluginService
}

func (p *GameConfigPlugin) GetInfo(
	_ context.Context,
	_ *pluginproto.GetInfoRequest,
) (*pluginproto.PluginInfo, error) {
	return &pluginproto.PluginInfo{
		Id:          "game-config-editor",
		Name:        "Game Config Editor",
		Version:     "0.4.0",
		Description: "Structured editors for game server config files",
		Author:      "psinetreject",
		ApiVersion:  "1",
	}, nil
}

func (p *GameConfigPlugin) GetFrontendBundle(
	_ context.Context,
	_ *pluginproto.GetFrontendBundleRequest,
) (*pluginproto.GetFrontendBundleResponse, error) {
	return &pluginproto.GetFrontendBundleResponse{
		HasBundle: true,
		Bundle:    frontendBundle,
		HasStyles: true,
		Styles:    frontendStyles,
	}, nil
}
