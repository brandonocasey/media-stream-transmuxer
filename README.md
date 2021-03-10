<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [TODO](#todo)
  - [References](#references)
  - [Tools used](#tools-used)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## TODO
* general
  * Document the format specification
  * disallow passthrough for certain formtats (normal mp4)
  * Should the download streaming happen in the web worker, or should we pass the data up?
    * This would allow us to use a sample table to only download relevant data for a segment rather than all of it.
* Should we support the following:
  * vp8
  * vp9
  * ac-3/ec-3
  * vorbis
  * avi
  * raw av1
* adts
  * Write a muxer
* ebml
  * support fragmented ebml in the muxer/demuxer "init segments"
  * Support "sidx"
  * do we need to split on keyframes
  * How do we set frame duration??
* flac
  * Current demuxer does not work as we need bit level granularity to parse out flac frames
  * Write a muxer
* h264
  * Current demuxer code is a prototype that works but only runs in nodejs
  * Write a muxer
* h265
  * Write a demuxer
  * Write a muxer
* m2ts
  * Current demuxer code is a prototype that seems to work but only runs in nodejs
  * Write a muxer
* bmff
  * support fragmented mp4 in the muxer/demuxer "init segments"
  * support "sidx"
  * Do we have to split moof on keyframes?
  * test with mov and other bmff files
* mpeg
  * Current demuxer code is a prototype that seems to work but only runs in nodejs
  * Write a muxer
* ogg
  * Current demuxer code is a prototype that seems to work but only runs in nodejs
  * Write a muxer
  * Finish OpusHead parser
* riff
  * write a muxer
  * write a demuxer
* Subtitle formats
  * should these be supported?

### References
* ebml
  * https://matroska-org.github.io/libebml/specs.html
  * https://www.matroska.org/technical/elements.html
* adts
  * https://wiki.multimedia.cx/index.php?title=ADTS
* h264
  * https://yumichan.net/video-processing/video-compression/introduction-to-h264-nal-unit/
* h265
  * https://gist.github.com/figgis/fd509a02d4b1aa89f6ef
* av1
  * https://aomediacodec.github.io/av1-spec/av1-spec.pdf
  * https://aomediacodec.github.io/av1-isobmff/
* mpeg
  * https://www.codeproject.com/articles/8295/mpeg-audio-frame-header
  * https://github.com/biril/mp3-parser/tree/master/lib
* m2ts
  * https://en.wikipedia.org/wiki/MPEG_transport_stream
* bmff
  * https://github.com/gpac/mp4box.js
  * https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFPreface/qtffPreface.html
* flac
  * https://xiph.org/flac/documentation_format_overview.html
* ogg
  * https://xiph.org/ogg/doc/framing.html
* opus
  * https://opus-codec.org/docs/opusfile_api-0.5/structOpusHead.html

### Tools used
* [H264Naked](https://en.wikipedia.org/wiki/Exponential-Golomb_coding)
* [MKVToolNix](https://mkvtoolnix.download/) and its included command line tools, mostly mkvinfo and the gui
* [A hex editor like Hex Fiend](https://github.com/ridiculousfish/HexFiend)
* [Mp4box.js filereader](https://gpac.github.io/mp4box.js/test/filereader.html)
* [oggz](https://wiki.xiph.org/Oggz)
* [opus-tools](https://opus-codec.org/downloads/)
* [ffmpeg/ffprobe](https://ffmpeg.org/)
* [tsduck](https://tsduck.io/) specifically tsdump
