module github.com/psinetreject/GameConfigEditor

go 1.25

require github.com/gameap/gameap v0.0.0

require (
	github.com/knqyf263/go-plugin v0.9.0 // indirect
	github.com/planetscale/vtprotobuf v0.6.0 // indirect
	github.com/tetratelabs/wazero v1.11.0 // indirect
	golang.org/x/sys v0.39.0 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)

// The GameAP module is v4.x but its module path has no /v4 suffix, so it can't
// be `go get`-ed directly. build.sh checks out a matching tag into ./.sdk/gameap.
replace github.com/gameap/gameap => ./.sdk/gameap
