* disallow passthrough for some formats (normal mp4, aka non fmp4)
* opus codec delay and seek preroll nonesense
* should we do download streaming in the web worker
* Add unit tests for various on the fly remuxing
* rename project
* spliting moof on keyframes?? is it really needed
* does ebml even need to split on keyframes or can we just spit out keyframes less quick on the demuxer
* only demux needed data?
* can we make fetching muxer controlled based on segment info. For instance in mp4 we are given a sample table and could download just what we need.
* ebml needs to set frame durations in demuxer
