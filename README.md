<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [TODO](#todo)
  - [References](#references)
  - [Tools used](#tools-used)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## TODO
* Missing Muxer, do we need it?
  * ADTS
  * M2TS
  * H264
  * ogg
  * mp3/mpeg
  * h265
* Missing Demuxer
  * Fragmented bmff
  * Fragmented ebml
* Missing Both
  * riff
  * subtitles?
  * flac: needs bit level granularity to parse out flac frames, maybe bitset npm pkg?
* Should we support the following:
  * vp8
  * vp9
  * ac-3/ec-3
  * vorbis
  * avi (riff?)
  * raw av1
* general
  * Document the format specification
  * disallow passthrough for certain formtats (normal mp4)
  * demuxer configuration based on muxer? h264 annex b vs AVCC
  * Should the download streaming happen in the web worker, or should we pass the data up?
  * Find out how to correctly deal with baseMediaDecodeTime, timescale, and track timescale in ebml/bmff
* ogg
  * parse flac, vorbis, theora, and speex headers
  * switch to using opus head setter/getter from this file.
* ebml
  * Support "sidx"
  * do we need to split on keyframes
  * How do we set frame duration??
* bmff
  * support "sidx"
  * Do we have to split moof on keyframes?
  * test with mov and other bmff files
* h265/h264
  * switch exp-golomb with bitset pkg?

### References
* ebml
  * https://matroska-org.github.io/libebml/specs.html
  * https://www.matroska.org/technical/elements.html
* adts
  * https://wiki.multimedia.cx/index.php?title=ADTS
* h264
  * https://yumichan.net/video-processing/video-compression/introduction-to-h264-nal-unit/
  * https://en.wikipedia.org/wiki/Exponential-Golomb_coding
* h265
  * https://gist.github.com/BrandonHaynes/17a10939ea552095cbbac4c739bf8009
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
* [H264Naked](https://github.com/shi-yan/H264Naked)
* [MKVToolNix](https://mkvtoolnix.download/) and its included command line tools, mostly mkvinfo and the gui
* [A hex editor like Hex Fiend](https://github.com/ridiculousfish/HexFiend)
* [Mp4box.js filereader](https://gpac.github.io/mp4box.js/test/filereader.html)
* [oggz](https://wiki.xiph.org/Oggz)
* [opus-tools](https://opus-codec.org/downloads/)
* [ffmpeg/ffprobe](https://ffmpeg.org/)
* [tsduck](https://tsduck.io/) specifically tsdump
