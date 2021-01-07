
const fs = require('fs')
const path = require('path')
const util = require('util')
const { Writable } = require('stream')

const cwd = process.cwd()

// we are using this because we want the regular file descriptors returned,
// not the FileHandle objects from fs.promises.open
const fsOpen = util.promisify(fs.open)

class DemuxSink extends Writable {
  constructor(options) {
    const { dumpFolder, log, onBeforeWrite } = options

    super({ objectMode: true })

    this.closeReason = undefined
    this.dumpFolder = dumpFolder
    this.log = log
    this.onBeforeWrite = onBeforeWrite
    this.timeoutId = -1
    this.sinkMap = new Map()
    this.sinkMetadata = new WeakMap()
  }

  close = (reason) => {
    this.closeReason = new Error(reason)
    super.end(this.destroy)
  }

  timeout = () => this.close('TIMEOUT')

  emitError = error =>
    super.emit('error', error)

  destroy = () =>
    super.destroy()

  _write(obj, _, cb) {
    clearTimeout(this.timeoutId)
    this.timeoutId = setTimeout(this.timeout, 30000)

    this.handleSinkEvent(obj)
      .then(cb)
      .catch(cb)
  }

  _final(cb) {
    if (this.closeReason) {
      this.log('close-demux', this.closeReason.message)
    } else {
      this.log('close-demux')
    }

    for (const sinkId of this.sinkMap.keys()) {
      this.sinkClose(sinkId)
    }

    cb(this.closeReason)
  }

  sinkClose(id) {
    const sink = this.sinkMap.get(id)

    this.log(id, 'close-sink')
    sink?.end()

    this.sinkMap.delete(id)
  }

  async sinkCreate(id) {
    const idealPath = path.resolve(cwd, this.dumpFolder, id)

    let i = 0
    let fd
    let filePath = idealPath

    while(!fd) {
      try {
        fd = await fsOpen(filePath, 'wx')
      } catch(err) {
        if (err.code !== 'EEXIST') {
          return this.emitError(err)
        }

        filePath = `${idealPath}_${++i}`
      }
    }

    this.log(id, 'open-sink', path.basename(filePath))

    const sink = fs.createWriteStream(filePath, { fd })
    sink.on('error', this.emitError)

    this.sinkMap.set(id, sink)
    return sink
  }

  sinkUpdateMetadata (sink, data) {
    this.sinkMetadata.set(sink, data)
  }

  sinkWrite(sink, data) {
    const writable = this.onBeforeWrite
      ? this.onBeforeWrite(data)
      : data

    if (writable) {
      sink.write(writable)
      sink.write('\n')
    }

    return sink.writableNeedDrain
  }

  async handleSinkEvent(event) {
    const { dumpId: id, type, ...data } = event
    this.log(id, type)

    const sink = this.sinkMap.get(id) || await this.sinkCreate(id)

    switch (type) {
      case 'close':
        return this.sinkClose(id)

      case 'identity':
        return this.sinkUpdateMetadata(sink, data)

      case 'stats-entry':
        return this.sinkWrite(sink, data.data)

      default:
        return
    }
  }
}

module.exports = DemuxSink
