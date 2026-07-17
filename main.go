//go:build wasip1

// GameAP plugin: Palworld settings editor.
//
// This Go module is a thin WASM shell. All it does is implement the GameAP
// PluginService well enough to (a) identify itself and (b) hand the panel the
// compiled Vue frontend bundle. The actual editor logic lives in ./frontend.
//
// The host (GameAP) reads and writes the file for us — see the frontend's
// file-editor registration — so this backend needs no filesystem or
// server-control host calls for the basic editor.
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
	pluginproto.RegisterPluginService(&PalworldSettingsPlugin{})
}

// PalworldSettingsPlugin embeds EmptyPluginService so we only override the two
// methods we care about; everything else gets a no-op default.
type PalworldSettingsPlugin struct {
	*sdk.EmptyPluginService
}

func (p *PalworldSettingsPlugin) GetInfo(
	_ context.Context,
	_ *pluginproto.GetInfoRequest,
) (*pluginproto.PluginInfo, error) {
	return &pluginproto.PluginInfo{
		Id:          "palworld-settings",
		Name:        "Palworld Settings Editor",
		Version:     "0.2.0",
		Description: "Structured editor for PalWorldSettings.ini",
		Author:      "psinetreject",
		ApiVersion:  "1",
	}, nil
}

func (p *PalworldSettingsPlugin) GetFrontendBundle(
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
