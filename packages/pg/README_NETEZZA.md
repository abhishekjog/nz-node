# Netezza Node.js Driver

A Node.js driver for IBM Netezza databases, based on the [nzpy](https://github.com/IBM/nzpy) protocol implementation.

## Overview

This is a dedicated Netezza driver that implements the Netezza-specific connection protocol. It is **not** compatible with standard PostgreSQL databases - it is designed exclusively for Netezza Performance Server (NPS).

## Installation

```bash
npm install pg
```

## Features

- **Full Netezza Protocol Support**: Implements CP_VERSION_2 through CP_VERSION_6
- **Multiple Authentication Methods**: 
  - Plain password (AUTH_REQ_PASSWORD)
  - MD5 hashed password (AUTH_REQ_MD5)
  - SHA256 hashed password (AUTH_REQ_SHA256)
- **SSL/TLS Support**: Configurable security levels (0-3)
- **Guardium Audit Integration**: Automatically sends client metadata for audit logging
- **Connection Pooling**: Built-in connection pool support
- **Promise and Callback APIs**: Flexible async patterns

## Quick Start

### Basic Connection

```javascript
const { Client } = require('pg')

const client = new Client({
  host: 'netezza-host.example.com',
  port: 5480,  // Default Netezza port
  database: 'mydb',
  user: 'myuser',
  password: 'mypassword'
})

await client.connect()

try {
  const result = await client.query('SELECT * FROM my_table')
  console.log(result.rows)
} finally {
  await client.end()
}
```

### Using Connection Pool

```javascript
const { Pool } = require('pg')

const pool = new Pool({
  host: 'netezza-host.example.com',
  port: 5480,
  database: 'mydb',
  user: 'myuser',
  password: 'mypassword',
  max: 20,  // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Query directly from pool
const result = await pool.query('SELECT NOW()')
console.log(result.rows)

// Or get a client from pool
const client = await pool.connect()
try {
  await client.query('BEGIN')
  const res = await client.query('INSERT INTO users(name) VALUES($1)', ['John'])
  await client.query('COMMIT')
} catch (e) {
  await client.query('ROLLBACK')
  throw e
} finally {
  client.release()
}

await pool.end()
```

## Configuration Options

### Connection Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | string | 'localhost' | Netezza server hostname |
| `port` | number | 5480 | Netezza server port |
| `database` | string | - | Database name |
| `user` | string | - | Username |
| `password` | string | - | Password |
| `securityLevel` | number | 0 | SSL/TLS security level (0-3) |
| `pgOptions` | string | - | PostgreSQL options string |
| `appName` | string | script name | Application name for audit logs |
| `debug` | boolean | false | Enable debug logging |
| `connectionTimeoutMillis` | number | 0 | Connection timeout in milliseconds |
| `keepAlive` | boolean | false | Enable TCP keep-alive |
| `keepAliveInitialDelayMillis` | number | 0 | Initial delay for keep-alive |

### Security Levels

- **0**: Preferred Unsecured (default) - Try SSL, fall back to unsecured
- **1**: Only Unsecured - Never use SSL
- **2**: Preferred Secured - Try SSL, fail if not available
- **3**: Only Secured - Require SSL, fail if not available

### SSL Configuration

```javascript
const fs = require('fs')

const client = new Client({
  host: 'netezza-host.example.com',
  port: 5480,
  database: 'mydb',
  user: 'myuser',
  password: 'mypassword',
  securityLevel: 3,  // Require SSL
  ssl: {
    ca: fs.readFileSync('/path/to/ca.crt').toString(),
    cert: fs.readFileSync('/path/to/client.crt').toString(),
    key: fs.readFileSync('/path/to/client.key').toString(),
    rejectUnauthorized: true
  }
})
```

## API Reference

### Client

#### `new Client(config)`

Creates a new Netezza client instance.

#### `client.connect(callback?): Promise<void>`

Establishes connection to Netezza server.

```javascript
// Promise
await client.connect()

// Callback
client.connect((err) => {
  if (err) console.error(err)
})
```

#### `client.query(text, values?, callback?): Promise<Result>`

Executes a query.

```javascript
// Simple query
const result = await client.query('SELECT * FROM users')

// Parameterized query
const result = await client.query(
  'SELECT * FROM users WHERE id = $1',
  [123]
)

// Query config object
const result = await client.query({
  text: 'SELECT * FROM users WHERE id = $1',
  values: [123],
  rowMode: 'array'
})
```

#### `client.end(callback?): Promise<void>`

Closes the connection.

```javascript
await client.end()
```

### Pool

#### `new Pool(config)`

Creates a new connection pool.

#### `pool.query(text, values?, callback?): Promise<Result>`

Executes a query using a client from the pool.

#### `pool.connect(callback?): Promise<PoolClient>`

Acquires a client from the pool.

```javascript
const client = await pool.connect()
try {
  // Use client
} finally {
  client.release()  // Return to pool
}
```

#### `pool.end(callback?): Promise<void>`

Drains the pool and closes all clients.

### Result Object

```javascript
{
  rows: [],        // Array of row objects
  fields: [],      // Array of field metadata
  rowCount: 0,     // Number of rows
  command: 'SELECT' // SQL command
}
```

## Examples

### Transactions

```javascript
const client = await pool.connect()

try {
  await client.query('BEGIN')
  
  await client.query('INSERT INTO accounts(name, balance) VALUES($1, $2)', 
    ['Alice', 1000])
  await client.query('INSERT INTO accounts(name, balance) VALUES($1, $2)', 
    ['Bob', 500])
  
  await client.query('COMMIT')
  console.log('Transaction committed')
} catch (e) {
  await client.query('ROLLBACK')
  console.error('Transaction rolled back', e)
  throw e
} finally {
  client.release()
}
```

### Prepared Statements

```javascript
const query = {
  name: 'fetch-user',
  text: 'SELECT * FROM users WHERE id = $1',
  values: [1]
}

const result = await client.query(query)
```

### Streaming Results

```javascript
const { QueryStream } = require('pg-query-stream')

const client = await pool.connect()
const query = new QueryStream('SELECT * FROM large_table')
const stream = client.query(query)

stream.on('data', (row) => {
  console.log(row)
})

stream.on('end', () => {
  client.release()
})
```

### Error Handling

```javascript
try {
  await client.query('SELECT * FROM nonexistent_table')
} catch (err) {
  console.error('Query error:', err.message)
  console.error('Error code:', err.code)
  console.error('Error detail:', err.detail)
}
```

## Environment Variables

The driver respects standard PostgreSQL environment variables:

- `PGHOST` - Netezza server hostname
- `PGPORT` - Netezza server port
- `PGDATABASE` - Database name
- `PGUSER` - Username
- `PGPASSWORD` - Password

```javascript
// Uses environment variables
const client = new Client()
await client.connect()
```

## Debugging

Enable debug mode to see detailed handshake information:

```javascript
const client = new Client({
  host: 'netezza-host.example.com',
  port: 5480,
  database: 'mydb',
  user: 'myuser',
  password: 'mypassword',
  debug: true  // Enable debug logging
})
```

This will output:
- Handshake version negotiation
- Protocol version selection
- Authentication method used
- Connection state changes

## Differences from PostgreSQL

This driver is **not compatible** with PostgreSQL. Key differences:

1. **Connection Protocol**: Uses Netezza-specific handshake (CP_VERSION_2-6)
2. **Authentication**: Supports Netezza authentication methods (MD5, SHA256)
3. **Client Metadata**: Sends OS, hostname, username, app name for Guardium
4. **Default Port**: 5480 instead of 5432
5. **Protocol Messages**: Different message format and flow

## Troubleshooting

### Connection Timeout

```javascript
const client = new Client({
  // ... other options
  connectionTimeoutMillis: 5000  // 5 second timeout
})
```

### SSL Certificate Issues

For self-signed certificates:

```javascript
ssl: {
  rejectUnauthorized: false
}
```

### Authentication Failures

- Verify username and password
- Check user has database access
- Ensure authentication method is supported
- Try different security levels

### Debug Connection Issues

```javascript
const client = new Client({
  // ... other options
  debug: true
})

client.on('error', (err) => {
  console.error('Client error:', err)
})
```

## Performance Tips

1. **Use Connection Pooling**: Reuse connections for better performance
2. **Parameterized Queries**: Use `$1, $2` placeholders to prevent SQL injection
3. **Batch Operations**: Group multiple operations in transactions
4. **Tune Pool Size**: Adjust `max` based on your workload
5. **Connection Timeout**: Set appropriate timeout values

## Compatibility

- **Node.js**: Requires Node.js 12.x or higher
- **Netezza**: Compatible with Netezza Performance Server (NPS) versions supporting CP_VERSION_2-6
- **PostgreSQL**: **NOT COMPATIBLE** - This is a Netezza-only driver

## Implementation Details

Based on the Python [nzpy](https://github.com/IBM/nzpy) library protocol implementation.

Key components:
- `lib/netezza-handshake.js` - Handshake protocol implementation
- `lib/connection.js` - Connection management
- `lib/client.js` - Client API

## License

MIT License (same as pg package)

## Contributing

Contributions welcome! Please ensure:
1. Netezza protocol compatibility is maintained
2. Tests pass
3. Documentation is updated
4. Code follows existing style

## Support

For issues and questions:
- GitHub Issues: [Report issues](https://github.com/brianc/node-postgres/issues)
- Netezza Documentation: [IBM Netezza Docs](https://www.ibm.com/docs/en/netezza)

## References

- [nzpy GitHub Repository](https://github.com/IBM/nzpy)
- [IBM Netezza Performance Server](https://www.ibm.com/products/netezza)
- [Netezza SQL Reference](https://www.ibm.com/docs/en/netezza)