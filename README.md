# videojs-xhr-streamer

## Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Installation](#installation)
- [Usage](#usage)
  - [`<script>` Tag](#script-tag)
  - [mux worker -> browser](#mux-worker---browser)
    - [canPlay](#canplay)
    - [tracks](#tracks)
    - [data](#data)
    - [metadata](#metadata)
    - [captions](#captions)
  - [browser -> mux worker](#browser---mux-worker)
    - [canPlayResponse](#canplayresponse)
    - [push](#push)
    - [reset](#reset)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->
## Installation

```sh
npm install --save xhr-streamer
```

## Usage

To include videojs-xhr-streamer on your website or web application, use any of the following methods.

### `<script>` Tag

### mux worker -> browser
#### canPlay
Asks browser if any in a list of mimetypes can play.

#### tracks
> Note: if no tracks are returned you may want to abort the request/transcode here.
Supported tracks, with ids, that can be decoded/transcoded for playback.

#### data
transmuxed audio/video data with a trackid

#### metadata
parsed metadata

#### captions
parsed captions

### browser -> mux worker
#### canPlayResponse
Response to a canPlay with results from MediaSource.isTypeSupported.

#### push
Push data into the transmuxer

#### reset
Reset transmuxer state and throw out all data
