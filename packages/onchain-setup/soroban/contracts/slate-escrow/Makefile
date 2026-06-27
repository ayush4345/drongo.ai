default: build

all: test

SOROBAN_TARGET ?= ../../target

test: build
	cargo test

build: $(SOROBAN_TARGET)/wasm32v1-none/release/meteredverifier.wasm $(SOROBAN_TARGET)/wasm32v1-none/release/slate_agent_registry.wasm
	CARGO_TARGET_DIR=$(SOROBAN_TARGET) stellar contract build
	@ls -l $(SOROBAN_TARGET)/wasm32v1-none/release/*.wasm

$(SOROBAN_TARGET)/wasm32v1-none/release/meteredverifier.wasm:
	CARGO_TARGET_DIR=$(SOROBAN_TARGET) stellar contract build --manifest-path ../meteredverifier/Cargo.toml

$(SOROBAN_TARGET)/wasm32v1-none/release/slate_agent_registry.wasm:
	CARGO_TARGET_DIR=$(SOROBAN_TARGET) stellar contract build --manifest-path ../slate-agent-registry/Cargo.toml

fmt:
	cargo fmt --all

clean:
	cargo clean
