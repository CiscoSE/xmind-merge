## Synopsis

xmind-merge takes a directory of [XMind](https://www.xmind.net/) files and merges them into a master XMind file.

## Examples

See options:
```
node xmind-merge.js --help
```

Merge all the `.xmind` files in `~/example/` into `~/example.xmind` in alphabetical order based on the source filename:
```bash
node xmind-merge.js --src_dir ~/example/ --dst_xmind ~/example.xmind
```

Merge all the `.xmind` files in `~/example/` into `~/example.xmind` in alphabetical order based on the resulting topic list:
```bash
node xmind-merge.js --src_dir ~/example/ --dst_xmind ~/example.xmind --sort_topics
```

Merge all the `.xmind` files in `~/example/` into `~/example.xmind` in alphabetical order based on the resulting topic list, performing a deeper merge at the first level of topics, adding source attribution, and visually folding the first level of topics:
```bash
node xmind-merge.js --src_dir ~/example/ --dst_xmind ~/example.xmind --sort_topics --deeper --src_attr --fold
```

## Known Limitations

The public XMind file format [documentation](https://github.com/xmindltd/xmind/wiki/XMindFileFormat) is quite outdated. XMind (formerly called "XMind Zen" to differentiate it as the new one) has since moved to a JSON file format, while XMind 8 Pro continues to use the original XML file format. This utility only works with modern XMind files based on the JSON file format. If you have an older version of mindmap file, simple open it in the latest version of XMind and choose "Save As", which will update the file to the JSON format. The utility should display helpful errors and warnings if you happen to try and merge a mindmap that isn't in the newer format.

Only the first sheet in each source mindmap workbook is merged. Additional sheets are ignored.

There are likely features in the various versions of XMind that haven't been tested or enabled with this utility (e.g. markers, summaries, file encryption, multiple sheets in a workbook, etc.)

## Motivation

XMind 8 Pro includes a merge feature, but the newest application called just "XMind" (formerly "XMind Zen"), doesn't include this feature. This utility takes some of the functionality from the class XMind Pro merge feature and makes it more usable while being less error-prone when merging large numbers of mindmaps.

## Installation

Clone the repo and then do the following from the project directory:
```bash
npm install
node xmind-merge.js --help
```

To build portable binaries across windows, mac, and linux:
```bash
mkdir build
npm install --global pkg
npm run pkg
```
See [pkg](https://github.com/zeit/pkg) for more info

## Contributing

All contributions welcome. Feel free to clone/pull if you find issues or want new features, or post some basic info and steps to reproduce it in the issues section.

## License

This project is licensed under the Cisco Sample Code License.