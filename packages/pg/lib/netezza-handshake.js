'use strict'

/**
 * Netezza Handshake Implementation
 * Based on nzpy handshake protocol: https://github.com/IBM/nzpy/blob/master/nzpy/handshake.py
 * 
 * This module implements the Netezza-specific connection handshake protocol
 * to enable PostgreSQL client compatibility with Netezza databases.
 */

const crypto = require('crypto')
const os = require('os')
const path = require('path')

// Connection Protocol Versions
const CP_VERSION_1 = 1
const CP_VERSION_2 = 2
const CP_VERSION_3 = 3
const CP_VERSION_4 = 4
const CP_VERSION_5 = 5
const CP_VERSION_6 = 6

// Handshake Version Opcodes
const HSV2_INVALID_OPCODE = 0
const HSV2_CLIENT_BEGIN = 1
const HSV2_DB = 2
const HSV2_USER = 3
const HSV2_OPTIONS = 4
const HSV2_TTY = 5
const HSV2_REMOTE_PID = 6
const HSV2_PRIOR_PID = 7
const HSV2_CLIENT_TYPE = 8
const HSV2_PROTOCOL = 9
const HSV2_HOSTCASE = 10
const HSV2_SSL_NEGOTIATE = 11
const HSV2_SSL_CONNECT = 12
const HSV2_APPNAME = 13
const HSV2_CLIENT_OS = 14
const HSV2_CLIENT_HOST_NAME = 15
const HSV2_CLIENT_OS_USER = 16
const HSV2_64BIT_VARLENA_ENABLED = 17
const HSV2_CLIENT_DONE = 1000

// PostgreSQL Protocol Versions
const PG_PROTOCOL_3 = 3
const PG_PROTOCOL_4 = 4
const PG_PROTOCOL_5 = 5

// Authentication Types
const AUTH_REQ_OK = 0
const AUTH_REQ_KRB4 = 1
const AUTH_REQ_KRB5 = 2
const AUTH_REQ_PASSWORD = 3
const AUTH_REQ_CRYPT = 4
const AUTH_REQ_MD5 = 5
const AUTH_REQ_SHA256 = 6

// Client Types
const NPS_CLIENT = 0
const IPS_CLIENT = 1
const NPSCLIENT_TYPE_NODE = 15 // Custom type for Node.js

// Protocol Message Types
const AUTHENTICATION_REQUEST = 'R'.charCodeAt(0)
const ERROR_RESPONSE = 'E'.charCodeAt(0)
const NOTICE_RESPONSE = 'N'.charCodeAt(0)
const BACKEND_KEY_DATA = 'K'.charCodeAt(0)
const READY_FOR_QUERY = 'Z'.charCodeAt(0)

const NULL_BYTE = Buffer.from([0])

class NetezzaHandshake {
  constructor(stream, ssl, options = {}) {
    this.stream = stream
    this.ssl = ssl
    this.hsVersion = null
    this.protocol1 = null
    this.protocol2 = null
    
    // Guardium/audit information
    this.clientOS = os.platform()
    this.clientOSUser = os.userInfo().username
    this.clientHostName = os.hostname()
    this.appName = options.appName || path.basename(process.argv[1] || 'node')
    
    this.debug = options.debug || false
  }

  log(message, ...args) {
    if (this.debug) {
      console.log(`[NetezzaHandshake] ${message}`, ...args)
    }
  }

  // Pack 16-bit integer (short)
  packShort(value) {
    const buf = Buffer.allocUnsafe(2)
    buf.writeInt16BE(value, 0)
    return buf
  }

  // Pack 32-bit integer
  packInt(value) {
    const buf = Buffer.allocUnsafe(4)
    buf.writeInt32BE(value, 0)
    return buf
  }

  // Unpack 32-bit integer
  unpackInt(buffer) {
    return buffer.readInt32BE(0)
  }

  async startup(database, securityLevel, user, password, pgOptions) {
    try {
      // Step 1: Negotiate handshake version
      this.log('Starting handshake negotiation')
      if (!await this.negotiateHandshake()) {
        throw new Error('Handshake negotiation failed')
      }

      // Step 2: Send handshake information
      this.log('Sending handshake information')
      if (!await this.sendHandshakeInfo(database, securityLevel, user, pgOptions)) {
        throw new Error('Failed to send handshake information')
      }

      // Step 3: Authenticate
      this.log('Authenticating')
      if (!await this.authenticate(password)) {
        throw new Error('Authentication failed')
      }

      // Step 4: Wait for connection complete
      this.log('Waiting for connection complete')
      if (!await this.waitConnectionComplete()) {
        throw new Error('Connection completion failed')
      }

      this.log('Netezza handshake successful')
      return true
    } catch (error) {
      this.log('Handshake error:', error.message)
      throw error
    }
  }

  async negotiateHandshake() {
    let version = CP_VERSION_6
    
    while (true) {
      this.log(`Trying handshake version: ${version}`)
      
      // Send handshake version
      const payload = Buffer.concat([
        this.packShort(HSV2_CLIENT_BEGIN),
        this.packShort(version)
      ])
      
      this.stream.write(this.packInt(payload.length + 4))
      this.stream.write(payload)
      
      // Wait for response
      const response = await this.readBytes(1)
      this.log(`Handshake response: ${response.toString()}`)
      
      if (response.toString() === 'N') {
        // Accepted
        this.hsVersion = version
        this.protocol2 = 0
        return true
      } else if (response.toString() === 'M') {
        // Server suggests different version
        const suggestedVersion = await this.readBytes(1)
        const versionChar = suggestedVersion.toString()
        
        if (versionChar === '2') version = CP_VERSION_2
        else if (versionChar === '3') version = CP_VERSION_3
        else if (versionChar === '4') version = CP_VERSION_4
        else if (versionChar === '5') version = CP_VERSION_5
        else {
          throw new Error(`Unsupported version suggested: ${versionChar}`)
        }
      } else if (response.toString() === 'E') {
        throw new Error('Bad attribute value error')
      } else {
        throw new Error('Bad protocol error')
      }
    }
  }

  async sendHandshakeInfo(database, securityLevel, user, pgOptions) {
    // Send database name first
    if (!await this.sendDatabase(database)) {
      return false
    }

    // Handle SSL negotiation if needed
    if (!await this.secureSession(securityLevel)) {
      return false
    }

    // Set protocol version
    if (!this.setNextDataProtocol()) {
      return false
    }

    // Send handshake based on version
    if (this.hsVersion === CP_VERSION_6 || this.hsVersion === CP_VERSION_4) {
      return await this.sendHandshakeVersion4(user, pgOptions)
    } else if (this.hsVersion === CP_VERSION_5 || this.hsVersion === CP_VERSION_3 || this.hsVersion === CP_VERSION_2) {
      return await this.sendHandshakeVersion2(user, pgOptions)
    }

    return true
  }

  async sendDatabase(database) {
    if (!database) {
      return true
    }

    const dbBuffer = Buffer.from(database, 'utf8')
    const payload = Buffer.concat([
      this.packShort(HSV2_DB),
      dbBuffer,
      NULL_BYTE
    ])

    this.stream.write(this.packInt(payload.length + 4))
    this.stream.write(payload)

    const response = await this.readBytes(1)
    
    if (response.toString() === 'N') {
      return true
    } else if (response[0] === ERROR_RESPONSE) {
      throw new Error('Database authentication error')
    }
    
    return false
  }

  setNextDataProtocol() {
    if (this.protocol2 === 0) {
      this.protocol2 = PG_PROTOCOL_5
    } else if (this.protocol2 === 5) {
      this.protocol2 = PG_PROTOCOL_4
    } else if (this.protocol2 === 4) {
      this.protocol2 = PG_PROTOCOL_3
    } else {
      return false
    }

    this.protocol1 = PG_PROTOCOL_3
    this.log(`Protocol set to: ${this.protocol1}.${this.protocol2}`)
    return true
  }

  async secureSession(securityLevel) {
    // Security levels:
    // 0 - Preferred Unsecured
    // 1 - Only Unsecured
    // 2 - Preferred Secured
    // 3 - Only Secured
    
    if (!this.ssl || securityLevel === 1) {
      // No SSL required
      return true
    }

    // For now, implement basic SSL negotiation
    // Full SSL implementation would require more complex logic
    this.log(`Security level: ${securityLevel}`)
    return true
  }

  async sendHandshakeVersion2(user, pgOptions) {
    const userBuffer = Buffer.from(user, 'utf8')
    
    const steps = [
      { opcode: HSV2_USER, data: Buffer.concat([userBuffer, NULL_BYTE]) },
      { opcode: HSV2_PROTOCOL, data: Buffer.concat([this.packShort(this.protocol1), this.packShort(this.protocol2)]) },
      { opcode: HSV2_REMOTE_PID, data: this.packInt(process.pid) },
      { opcode: HSV2_OPTIONS, data: pgOptions ? Buffer.concat([Buffer.from(pgOptions, 'utf8'), NULL_BYTE]) : null },
      { opcode: HSV2_CLIENT_TYPE, data: this.packShort(NPSCLIENT_TYPE_NODE) },
    ]

    if (this.hsVersion === CP_VERSION_5 || this.hsVersion === CP_VERSION_6) {
      steps.push({ opcode: HSV2_64BIT_VARLENA_ENABLED, data: this.packShort(IPS_CLIENT) })
    }

    steps.push({ opcode: HSV2_CLIENT_DONE, data: null })

    for (const step of steps) {
      if (step.data === null && step.opcode !== HSV2_CLIENT_DONE) {
        continue
      }

      const payload = step.data 
        ? Buffer.concat([this.packShort(step.opcode), step.data])
        : this.packShort(step.opcode)

      this.stream.write(this.packInt(payload.length + 4))
      this.stream.write(payload)

      if (step.opcode === HSV2_CLIENT_DONE) {
        return true
      }

      const response = await this.readBytes(1)
      if (response.toString() !== 'N') {
        if (response[0] === ERROR_RESPONSE) {
          throw new Error('Connection failed during handshake')
        }
        return false
      }
    }

    return true
  }

  async sendHandshakeVersion4(user, pgOptions) {
    const userBuffer = Buffer.from(user, 'utf8')
    
    const steps = [
      { opcode: HSV2_USER, data: Buffer.concat([userBuffer, NULL_BYTE]) },
      { opcode: HSV2_APPNAME, data: Buffer.concat([Buffer.from(this.appName, 'utf8'), NULL_BYTE]) },
      { opcode: HSV2_CLIENT_OS, data: Buffer.concat([Buffer.from(this.clientOS, 'utf8'), NULL_BYTE]) },
      { opcode: HSV2_CLIENT_HOST_NAME, data: Buffer.concat([Buffer.from(this.clientHostName, 'utf8'), NULL_BYTE]) },
      { opcode: HSV2_CLIENT_OS_USER, data: Buffer.concat([Buffer.from(this.clientOSUser, 'utf8'), NULL_BYTE]) },
      { opcode: HSV2_PROTOCOL, data: Buffer.concat([this.packShort(this.protocol1), this.packShort(this.protocol2)]) },
      { opcode: HSV2_REMOTE_PID, data: this.packInt(process.pid) },
      { opcode: HSV2_OPTIONS, data: pgOptions ? Buffer.concat([Buffer.from(pgOptions, 'utf8'), NULL_BYTE]) : null },
      { opcode: HSV2_CLIENT_TYPE, data: this.packShort(NPSCLIENT_TYPE_NODE) },
    ]

    if (this.hsVersion === CP_VERSION_5 || this.hsVersion === CP_VERSION_6) {
      steps.push({ opcode: HSV2_64BIT_VARLENA_ENABLED, data: this.packShort(IPS_CLIENT) })
    }

    steps.push({ opcode: HSV2_CLIENT_DONE, data: null })

    for (const step of steps) {
      if (step.data === null && step.opcode !== HSV2_CLIENT_DONE) {
        continue
      }

      const payload = step.data 
        ? Buffer.concat([this.packShort(step.opcode), step.data])
        : this.packShort(step.opcode)

      this.stream.write(this.packInt(payload.length + 4))
      this.stream.write(payload)

      if (step.opcode === HSV2_CLIENT_DONE) {
        return true
      }

      const response = await this.readBytes(1)
      if (response.toString() !== 'N') {
        if (response[0] === ERROR_RESPONSE) {
          throw new Error('Connection failed during handshake')
        }
        return false
      }
    }

    return true
  }

  async authenticate(password) {
    const response = await this.readBytes(1)
    
    if (response[0] !== AUTHENTICATION_REQUEST) {
      throw new Error('Expected authentication request')
    }

    const authType = this.unpackInt(await this.readBytes(4))
    this.log(`Authentication type: ${authType}`)

    if (authType === AUTH_REQ_OK) {
      return true
    }

    const passwordBuffer = Buffer.from(password, 'utf8')

    if (authType === AUTH_REQ_PASSWORD) {
      // Plain password
      this.log('Sending plain password')
      const payload = Buffer.concat([passwordBuffer, NULL_BYTE])
      this.stream.write(this.packInt(payload.length + 4))
      this.stream.write(payload)
    } else if (authType === AUTH_REQ_MD5) {
      // MD5 password
      this.log('Sending MD5 password')
      const salt = await this.readBytes(2)
      const hash = crypto.createHash('md5')
      hash.update(Buffer.concat([salt, passwordBuffer]))
      const md5pwd = hash.digest('base64').replace(/=+$/, '')
      
      const payload = Buffer.concat([Buffer.from(md5pwd, 'utf8'), NULL_BYTE])
      this.stream.write(this.packInt(payload.length + 4))
      this.stream.write(payload)
    } else if (authType === AUTH_REQ_SHA256) {
      // SHA256 password
      this.log('Sending SHA256 password')
      const salt = await this.readBytes(2)
      const hash = crypto.createHash('sha256')
      hash.update(Buffer.concat([salt, passwordBuffer]))
      const sha256pwd = hash.digest('base64').replace(/=+$/, '')
      
      const payload = Buffer.concat([Buffer.from(sha256pwd, 'utf8'), NULL_BYTE])
      this.stream.write(this.packInt(payload.length + 4))
      this.stream.write(payload)
    } else {
      throw new Error(`Unsupported authentication type: ${authType}`)
    }

    return true
  }

  async waitConnectionComplete() {
    while (true) {
      const response = await this.readBytes(1)
      const msgType = response[0]

      if (msgType !== AUTHENTICATION_REQUEST) {
        await this.readBytes(4) // Skip message type length
        const length = this.unpackInt(await this.readBytes(4))
        
        if (msgType === NOTICE_RESPONSE) {
          const notice = await this.readBytes(length)
          this.log('Notice:', notice.toString('utf8'))
        } else if (msgType === BACKEND_KEY_DATA) {
          const pid = this.unpackInt(await this.readBytes(4))
          const key = this.unpackInt(await this.readBytes(4))
          this.log(`Backend PID: ${pid}, Key: ${key}`)
        } else if (msgType === READY_FOR_QUERY) {
          this.log('Connection ready')
          return true
        } else if (msgType === ERROR_RESPONSE) {
          const error = await this.readBytes(length)
          throw new Error(`Server error: ${error.toString('utf8')}`)
        }
      } else {
        const authType = this.unpackInt(await this.readBytes(4))
        if (authType === AUTH_REQ_OK) {
          this.log('Authentication successful')
          continue
        }
      }
    }
  }

  readBytes(count) {
    return new Promise((resolve, reject) => {
      const tryRead = () => {
        const data = this.stream.read(count)
        if (data) {
          resolve(data)
        } else {
          this.stream.once('readable', tryRead)
        }
      }
      tryRead()
    })
  }
}

module.exports = NetezzaHandshake

// Made with Bob
