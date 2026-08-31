import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { pool } from './db.js'
import authRouter from './routes/auth.js'
import categoriesRouter from './routes/categories.js'
import customersRouter from './routes/customers.js'
import inventoryRouter from './routes/inventory.js'
import ordersRouter from './routes/orders.js'
import productsRouter from './routes/products.js'
import staffRouter from './routes/staff.js'

const app = express()

app.use(cors({ origin: config.clientOrigin, credentials: true }))
app.use(express.json({ limit: '10kb' }))

app.get('/api/health', async (_request, response) => {
  await pool.query('SELECT 1')
  response.json({ status: 'ok' })
})

app.use('/api/auth', authRouter)
app.use('/api/staff', staffRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/products', productsRouter)
app.use('/api/customers', customersRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/orders', ordersRouter)

app.use((error, _request, response, _next) => {
  console.error(error)
  if (error.type === 'entity.parse.failed') return response.status(400).json({ message: 'Malformed JSON in request body.' })
  response.status(500).json({ message: 'The service could not process your request. Please try again later.' })
})

export default app
