#!/usr/bin/env node
'use strict'

/**
 * Netezza Driver Examples
 * 
 * This example demonstrates how to use the Netezza Node.js driver
 * to connect to IBM Netezza databases.
 */

const { Client } = require('../lib')

async function basicExample() {
  console.log('=== Basic Netezza Connection Example ===\n')
  
  const client = new Client({
    host: process.env.NETEZZA_HOST || 'localhost',
    port: parseInt(process.env.NETEZZA_PORT || '5480'),
    database: process.env.NETEZZA_DATABASE || 'system',
    user: process.env.NETEZZA_USER || 'admin',
    password: process.env.NETEZZA_PASSWORD || 'password',
    debug: true
  })

  try {
    console.log('Connecting to Netezza...')
    await client.connect()
    console.log('✓ Connected successfully!\n')

    // Simple query
    console.log('Executing query: SELECT CURRENT_TIMESTAMP')
    const result = await client.query('SELECT CURRENT_TIMESTAMP')
    console.log('Result:', result.rows[0])
    console.log()

    // Query with parameters
    console.log('Executing parameterized query...')
    const paramResult = await client.query(
      'SELECT $1::text as message, $2::int as number',
      ['Hello Netezza', 42]
    )
    console.log('Result:', paramResult.rows[0])
    console.log()

  } catch (error) {
    console.error('Error:', error.message)
    console.error(error.stack)
  } finally {
    await client.end()
    console.log('✓ Connection closed')
  }
}

async function secureConnectionExample() {
  console.log('\n=== Secure Netezza Connection Example ===\n')
  
  const client = new Client({
    host: process.env.NETEZZA_HOST || 'localhost',
    port: parseInt(process.env.NETEZZA_PORT || '5480'),
    database: process.env.NETEZZA_DATABASE || 'system',
    user: process.env.NETEZZA_USER || 'admin',
    password: process.env.NETEZZA_PASSWORD || 'password',
    securityLevel: 2, // Preferred secured
    appName: 'NetezzaExample',
    ssl: {
      rejectUnauthorized: false // For self-signed certificates
    }
  })

  try {
    console.log('Connecting with SSL...')
    await client.connect()
    console.log('✓ Secure connection established!\n')

    const result = await client.query('SELECT VERSION()')
    console.log('Netezza Version:', result.rows[0].version)
    console.log()

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await client.end()
    console.log('✓ Connection closed')
  }
}

async function poolExample() {
  console.log('\n=== Netezza Connection Pool Example ===\n')
  
  const { Pool } = require('../lib')
  
  const pool = new Pool({
    host: process.env.NETEZZA_HOST || 'localhost',
    port: parseInt(process.env.NETEZZA_PORT || '5480'),
    database: process.env.NETEZZA_DATABASE || 'system',
    user: process.env.NETEZZA_USER || 'admin',
    password: process.env.NETEZZA_PASSWORD || 'password',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  })

  try {
    console.log('Creating connection pool...')
    
    // Execute multiple queries concurrently
    const queries = []
    for (let i = 1; i <= 3; i++) {
      queries.push(
        pool.query(`SELECT ${i} as query_number, CURRENT_TIMESTAMP as ts`)
      )
    }

    const results = await Promise.all(queries)
    console.log('✓ Executed 3 concurrent queries:\n')
    results.forEach((result, index) => {
      console.log(`Query ${index + 1}:`, result.rows[0])
    })
    console.log()

    // Using a client from the pool
    const client = await pool.connect()
    try {
      console.log('Using pooled client for transaction...')
      await client.query('BEGIN')
      const result = await client.query('SELECT 1 as test')
      console.log('Transaction result:', result.rows[0])
      await client.query('COMMIT')
      console.log('✓ Transaction committed\n')
    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await pool.end()
    console.log('✓ Pool closed')
  }
}

async function errorHandlingExample() {
  console.log('\n=== Error Handling Example ===\n')
  
  const client = new Client({
    host: process.env.NETEZZA_HOST || 'localhost',
    port: parseInt(process.env.NETEZZA_PORT || '5480'),
    database: process.env.NETEZZA_DATABASE || 'system',
    user: process.env.NETEZZA_USER || 'admin',
    password: process.env.NETEZZA_PASSWORD || 'password'
  })

  try {
    await client.connect()
    console.log('✓ Connected\n')

    // Intentional error - invalid SQL
    try {
      await client.query('SELECT * FROM nonexistent_table')
    } catch (error) {
      console.log('Caught expected error:')
      console.log('  Code:', error.code)
      console.log('  Message:', error.message)
      console.log()
    }

    // Connection is still valid
    const result = await client.query('SELECT 1 as still_working')
    console.log('✓ Connection still works:', result.rows[0])
    console.log()

  } catch (error) {
    console.error('Unexpected error:', error.message)
  } finally {
    await client.end()
    console.log('✓ Connection closed')
  }
}

async function transactionExample() {
  console.log('\n=== Transaction Example ===\n')
  
  const { Pool } = require('../lib')
  
  const pool = new Pool({
    host: process.env.NETEZZA_HOST || 'localhost',
    port: parseInt(process.env.NETEZZA_PORT || '5480'),
    database: process.env.NETEZZA_DATABASE || 'system',
    user: process.env.NETEZZA_USER || 'admin',
    password: process.env.NETEZZA_PASSWORD || 'password'
  })

  const client = await pool.connect()

  try {
    console.log('Starting transaction...')
    await client.query('BEGIN')
    
    console.log('Executing queries in transaction...')
    await client.query('SELECT 1')
    await client.query('SELECT 2')
    
    await client.query('COMMIT')
    console.log('✓ Transaction committed successfully\n')
    
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('✗ Transaction rolled back:', error.message)
  } finally {
    client.release()
    await pool.end()
    console.log('✓ Connection closed')
  }
}

// Main execution
async function main() {
  console.log('Netezza Node.js Driver Examples')
  console.log('================================\n')
  console.log('Environment variables:')
  console.log('  NETEZZA_HOST:', process.env.NETEZZA_HOST || 'localhost')
  console.log('  NETEZZA_PORT:', process.env.NETEZZA_PORT || '5480')
  console.log('  NETEZZA_DATABASE:', process.env.NETEZZA_DATABASE || 'system')
  console.log('  NETEZZA_USER:', process.env.NETEZZA_USER || 'admin')
  console.log('  NETEZZA_PASSWORD:', process.env.NETEZZA_PASSWORD ? '***' : 'password')
  console.log()

  try {
    await basicExample()
    
    // Uncomment to run other examples
    // await secureConnectionExample()
    // await poolExample()
    // await errorHandlingExample()
    // await transactionExample()
    
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error)
}

module.exports = {
  basicExample,
  secureConnectionExample,
  poolExample,
  errorHandlingExample,
  transactionExample
}

// Made with Bob
