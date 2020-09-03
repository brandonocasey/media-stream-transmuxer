<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [TODO](#todo)
  - [Demux containers into tracks and frames](#demux-containers-into-tracks-and-frames)
  - [Mux frames and tracks into containers:](#mux-frames-and-tracks-into-containers)
  - [Link to specs used](#link-to-specs-used)
  - [Tools used](#tools-used)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## TODO
* Parse out all tracks from content, not just relevant ones
* demux mp4 -> fmp4
* demux webm -> fwebm??
* if we get an init segment for webm/mp4 do not chunk up
* port over sourceupdater

### Demux containers into tracks and frames
aac
flac
h264
h265
mp4/mov
mp3
ogg
riff
ts
ebml

### Mux frames and tracks into containers:
mp4
webm

### Link to specs used

### Tools used
[H264Naked](https://en.wikipedia.org/wiki/Exponential-Golomb_coding)
[MKVToolNix](https://mkvtoolnix.download/) and its included command line tools, mostly mkvinfo and the gui
[A hex editor like Hex Fiend](https://github.com/ridiculousfish/HexFiend)
[Mp4box.js filereader](https://gpac.github.io/mp4box.js/test/filereader.html)
[oggz](https://wiki.xiph.org/Oggz)
[opus-tools](https://opus-codec.org/downloads/)
[ffmpeg/ffprobe](https://ffmpeg.org/)
[tsduck](https://tsduck.io/) specifically tsdump
