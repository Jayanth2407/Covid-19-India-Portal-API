// Importing necessary modules
const express = require('express') // Web framework for building APIs
const {open} = require('sqlite') // SQLite integration for database operations
const sqlite3 = require('sqlite3') // SQLite database driver
const path = require('path') // Utility module for handling file paths
const bcrypt = require('bcrypt') // Library for hashing passwords
const jwt = require('jsonwebtoken') // Library for working with JSON Web Tokens

// Define the path to the database file
const databasePath = path.join(__dirname, 'covid19IndiaPortal.db')

// Initialize the Express application
const app = express()

// Middleware to parse JSON request bodies
app.use(express.json())

// Database connection variable
let database = null

// Function to initialize the database and start the server
const initializeDbAndServer = async () => {
  try {
    // Open the SQLite database
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    })

    // Start the server
    app.listen(3000, () =>
      console.log('Server Running at http://localhost:3000/'),
    )
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1) // Exit the process if there's an error
  }
}

// Call the function to initialize the database and server
initializeDbAndServer()

// Helper function to convert state database object to response format
const convertStateDbObjectToResponseObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

// Helper function to convert district database object to response format
const convertDistrictDbObjectToResponseObject = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

// Middleware to authenticate JWT token
function authenticateToken(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization'] // Get the Authorization header
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1] // Extract the token from the header
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token') // Send error if token is missing
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token') // Send error if token is invalid
      } else {
        next() // Proceed if token is valid
      }
    })
  }
}

// API to log in a user and generate a JWT token
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const databaseUser = await database.get(selectUserQuery)
  if (databaseUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password,
    )
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN') // Generate JWT token
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

// API to get all states
app.get('/states/', authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT
      *
    FROM
      state;`
  const statesArray = await database.all(getStatesQuery)
  response.send(
    statesArray.map(eachState =>
      convertStateDbObjectToResponseObject(eachState),
    ),
  )
})

// API to get a state by stateId
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
    SELECT 
      *
    FROM 
      state 
    WHERE 
      state_id = ${stateId};`
  const state = await database.get(getStateQuery)
  response.send(convertStateDbObjectToResponseObject(state))
})

// API to get a district by districtId
app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictsQuery = `
    SELECT
      *
    FROM
     district
    WHERE
      district_id = ${districtId};`
    const district = await database.get(getDistrictsQuery)
    response.send(convertDistrictDbObjectToResponseObject(district))
  },
)

// API to add a new district
app.post('/districts/', authenticateToken, async (request, response) => {
  const {stateId, districtName, cases, cured, active, deaths} = request.body
  const postDistrictQuery = `
  INSERT INTO
    district (state_id, district_name, cases, cured, active, deaths)
  VALUES
    (${stateId}, '${districtName}', ${cases}, ${cured}, ${active}, ${deaths});`
  await database.run(postDistrictQuery)
  response.send('District Successfully Added')
})

// API to delete a district by districtId
app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `
  DELETE FROM
    district
  WHERE
    district_id = ${districtId} 
  `
    await database.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)

// API to update district details
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const updateDistrictQuery = `
  UPDATE
    district
  SET
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active = ${active}, 
    deaths = ${deaths}
  WHERE
    district_id = ${districtId};
  `

    await database.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

// API to get state statistics
app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStateStatsQuery = `
    SELECT
      SUM(cases),
      SUM(cured),
      SUM(active),
      SUM(deaths)
    FROM
      district
    WHERE
      state_id=${stateId};`
    const stats = await database.get(getStateStatsQuery)
    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)

// Export the Express application
module.exports = app
