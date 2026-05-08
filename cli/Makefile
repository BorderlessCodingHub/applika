install:
	uv tool install --force .

install-dev:
	uv sync

install-linux:
	$(MAKE) install

install-macos:
	$(MAKE) install

install-windows:
	$(MAKE) install

test:
	uv run --no-sync pytest tests -q

help:
	uv run --no-sync applika --help

uninstall:
	uv tool uninstall applika-cli
