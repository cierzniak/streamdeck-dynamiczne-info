RUN = docker compose run --rm node

.PHONY: install build test lint validate pack icons all

install:
	$(RUN) npm install

build:
	$(RUN) npm run build

test:
	$(RUN) npm test

lint:
	$(RUN) npm run lint

validate: build
	$(RUN) npm run validate

pack: build
	$(RUN) npm run pack

icons:
	sh scripts/icons.sh

all: lint test validate
