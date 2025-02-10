'use strict'
const helper = require('./test-helper')
const { Client } = helper
var assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

var pguser = process.env['NZ_USER'] || process.env.USER
var pgdatabase = process.env['NZ_DATABASE'] || process.env.USER
var pgport = process.env['NZ_PORT'] || 5480

test('client settings', function () {
  test('defaults', function () {
    var client = new Client()
    assert.equal(client.user, pguser)
    assert.equal(client.database, pgdatabase)
    assert.equal(client.port, pgport)
    assert.equal(client.ssl, false)
  })

  test('custom', function () {
    var user = 'brian'
    var database = 'pgjstest'
    var password = 'boom'
    var client = new Client({
      user: user,
      database: database,
      port: 321,
      password: password,
      ssl: true,
    })

    assert.equal(client.user, user)
    assert.equal(client.database, database)
    assert.equal(client.port, 321)
    assert.equal(client.password, password)
    assert.equal(client.ssl, true)
  })

  test('custom ssl default on', function () {
    var old = process.env.PGSSLMODE
    process.env.PGSSLMODE = 'prefer'

    var client = new Client()
    process.env.PGSSLMODE = old

    assert.equal(client.ssl, true)
  })

  test('custom ssl force off', function () {
    var old = process.env.PGSSLMODE
    process.env.PGSSLMODE = 'prefer'

    var client = new Client({
      ssl: false,
    })
    process.env.PGSSLMODE = old

    assert.equal(client.ssl, false)
  })
})

test('initializing from a config string', function () {
  test('uses connectionString property', function () {
    var client = new Client({
      connectionString: 'netezza://brian:pass@host1:333/databasename',
    })
    assert.equal(client.user, 'brian')
    assert.equal(client.password, 'pass')
    assert.equal(client.host, 'host1')
    assert.equal(client.port, 333)
    assert.equal(client.database, 'databasename')
  })

  test('uses the correct values from the config string', function () {
    var client = new Client('netezza://brian:pass@host1:333/databasename')
    assert.equal(client.user, 'brian')
    assert.equal(client.password, 'pass')
    assert.equal(client.host, 'host1')
    assert.equal(client.port, 333)
    assert.equal(client.database, 'databasename')
  })

  test('uses the correct values from the config string with space in password', function () {
    var client = new Client('netezza://brian:pass word@host1:333/databasename')
    assert.equal(client.user, 'brian')
    assert.equal(client.password, 'pass word')
    assert.equal(client.host, 'host1')
    assert.equal(client.port, 333)
    assert.equal(client.database, 'databasename')
  })

  test('when not including all values the defaults are used', function () {
    var client = new Client('netezza://host1')
    assert.equal(client.user, process.env['NZ_USER'] || process.env.USER)
    assert.equal(client.password, process.env['NZ_PASSWORD'] || null)
    assert.equal(client.host, 'host1')
    assert.equal(client.port, process.env['NZ_PORT'] || 5480)
    assert.equal(client.database, process.env['NZ_DATABASE'] || process.env.USER)
  })

  test('when not including all values the environment variables are used', function () {
    var envUserDefined = process.env['NZ_USER'] !== undefined
    var envPasswordDefined = process.env['NZ_PASSWORD'] !== undefined
    var envHostDefined = process.env['NZ_HOST'] !== undefined
    var envPortDefined = process.env['NZ_PORT'] !== undefined
    var envDBDefined = process.env['NZ_DATABASE'] !== undefined

    var savedEnvUser = process.env['NZ_USER']
    var savedEnvPassword = process.env['NZ_PASSWORD']
    var savedEnvHost = process.env['NZ_HOST']
    var savedEnvPort = process.env['NZ_PORT']
    var savedEnvDB = process.env['NZ_DATABASE']

    process.env['NZ_USER'] = 'utUser1'
    process.env['NZ_PASSWORD'] = 'utPass1'
    process.env['NZ_HOST'] = 'utHost1'
    process.env['NZ_PORT'] = 5464
    process.env['NZ_DATABASE'] = 'utDB1'

    var client = new Client('netezza://host1')
    assert.equal(client.user, process.env['NZ_USER'])
    assert.equal(client.password, process.env['NZ_PASSWORD'])
    assert.equal(client.host, 'host1')
    assert.equal(client.port, process.env['NZ_PORT'])
    assert.equal(client.database, process.env['NZ_DATABASE'])

    if (envUserDefined) {
      process.env['NZ_USER'] = savedEnvUser
    } else {
      delete process.env['NZ_USER']
    }

    if (envPasswordDefined) {
      process.env['NZ_PASSWORD'] = savedEnvPassword
    } else {
      delete process.env['NZ_PASSWORD']
    }

    if (envDBDefined) {
      process.env['NZ_DATABASE'] = savedEnvDB
    } else {
      delete process.env['NZ_DATABASE']
    }

    if (envHostDefined) {
      process.env['NZ_HOST'] = savedEnvHost
    } else {
      delete process.env['NZ_HOST']
    }

    if (envPortDefined) {
      process.env['NZ_PORT'] = savedEnvPort
    } else {
      delete process.env['NZ_PORT']
    }
  })
})

test('calls connect correctly on connection', function () {
  var client = new Client('/tmp')
  var usedPort = ''
  var usedHost = ''
  client.connection.connect = function (port, host) {
    usedPort = port
    usedHost = host
  }
  client.connect()
  assert.equal(usedPort, '/tmp/.s.PGSQL.' + pgport)
  assert.strictEqual(usedHost, undefined)
})
