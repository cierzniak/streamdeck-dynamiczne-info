#!/bin/sh
set -eu

plugin="info.dynamiczne.prices.sdPlugin/imgs"
mkdir -p "$plugin/plugin" "$plugin/actions/price"

render() {
	magick -background none -density 600 "$1" -resize "$2x$2" "$3"
}

render assets/icons/key.svg 256 "$plugin/plugin/marketplace.png"
render assets/icons/key.svg 512 "$plugin/plugin/marketplace@2x.png"
render assets/icons/mono.svg 28 "$plugin/plugin/category-icon.png"
render assets/icons/mono.svg 56 "$plugin/plugin/category-icon@2x.png"
render assets/icons/mono.svg 20 "$plugin/actions/price/icon.png"
render assets/icons/mono.svg 40 "$plugin/actions/price/icon@2x.png"
render assets/icons/key.svg 72 "$plugin/actions/price/key.png"
render assets/icons/key.svg 144 "$plugin/actions/price/key@2x.png"
