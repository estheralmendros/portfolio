.PHONY: install test lint typecheck build build-test smoke smoke-test e2e all dev preview

install:
	npm ci

## Unit (node) + component (jsdom) tests
test:
	npm test

lint:
	npm run lint

typecheck:
	npm run typecheck

## Real /content -> dist/
build:
	npm run build

## Fixture content -> dist-test/
build-test:
	npm run build:test

## Content-agnostic smoke checks over dist/
smoke: build
	npm run test:smoke

## Same smoke checks over dist-test/
smoke-test: build-test
	SMOKE_DIR=dist-test npm run test:smoke

## Playwright e2e against dist-test/ (needs `npx playwright install chromium` once)
e2e: build-test
	npm run test:e2e

## Everything CI runs, in CI order
all: lint typecheck test smoke smoke-test e2e

dev:
	npm run dev

preview: build
	npx astro preview --port 4321 --ignore-lock
