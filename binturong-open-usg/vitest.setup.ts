// Any setup scripts you might need go here

// Load .env files
import 'dotenv/config'

import { assertTestDatabase } from './tests/helpers/assertTestDatabase'

assertTestDatabase(process.env.DATABASE_URL)
