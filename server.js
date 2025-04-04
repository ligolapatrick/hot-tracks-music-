const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: '4123',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false },
}));

const { Sequelize, DataTypes } = require('sequelize');

// Database connection
const sequelize = new Sequelize('postgresql://joan:OuoGm8KTUvvwbdBDQH6Yxyrw4rxdlgMB@dpg-cvm51bbe5dus73afeea0-a.oregon-postgres.render.com/music_bicy', {
  dialect: 'postgres',
  logging: console.log, // Show raw SQL queries
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false },
  },
});

// User Model
const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false }, // Will store hashed passwords
});

// Music Model
const Music = sequelize.define('Music', {
  title: { type: DataTypes.STRING, allowNull: false },
  artist: { type: DataTypes.STRING, allowNull: false },
  genre: { type: DataTypes.STRING },
  releaseDate: { type: DataTypes.DATE, allowNull: false },
  filePath: { type: DataTypes.STRING, allowNull: false }, // Audio file path
  artworkPath: { type: DataTypes.STRING }, // Artwork file path
  uploadDate: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
  downloads: { type: DataTypes.INTEGER, defaultValue: 0 },
  tempo: { type: DataTypes.INTEGER }, // Beats per minute for mood detection
  mood: {
    type: DataTypes.STRING,
    allowNull: true, // Optional field for mood categories
    validate: {
      isIn: [
        ['Relaxing', 'Energetic', 'Chill', 'Romantic', 'Happy', 'Sad'], // Predefined moods
      ],
    },
  },
  playCount: { type: DataTypes.INTEGER, defaultValue: 0 }, // Track number of times played
});

// Favorite Model
const Favorite = sequelize.define('Favorite', {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  musicId: { type: DataTypes.INTEGER, allowNull: false },
});

// Playlist Model
const Playlist = sequelize.define('Playlist', {
  name: { type: DataTypes.STRING, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
});

// Playlist Item Model
const PlaylistItem = sequelize.define('PlaylistItem', {
  playlistId: { type: DataTypes.INTEGER, allowNull: false },
  musicId: { type: DataTypes.INTEGER, allowNull: false },
});

// Play Model
const Play = sequelize.define('Play', {
  userId: { type: DataTypes.INTEGER },
  musicId: { type: DataTypes.INTEGER, allowNull: false },
  playDate: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }, // Tracks when the song was played
});

const Lyrics = sequelize.define('Lyrics', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  songId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  line: {
    type: Sequelize.TEXT,
    allowNull: false,
  },
  timestamp: {
    type: Sequelize.FLOAT, // Timestamp in seconds
    allowNull: false,
  },
});

// Associations
User.hasMany(Favorite, { foreignKey: 'userId' });
Favorite.belongsTo(User, { foreignKey: 'userId' });
Favorite.belongsTo(Music, { foreignKey: 'musicId' });

User.hasMany(Playlist, { foreignKey: 'userId' });
Playlist.hasMany(PlaylistItem, { foreignKey: 'playlistId' });
PlaylistItem.belongsTo(Music, { foreignKey: 'musicId' });

User.hasMany(Playlist, { foreignKey: 'userId' });
Playlist.belongsTo(User, { foreignKey: 'userId' });
Playlist.hasMany(PlaylistItem, { foreignKey: 'playlistId' });
PlaylistItem.belongsTo(Playlist, { foreignKey: 'playlistId' });
PlaylistItem.belongsTo(Music, { foreignKey: 'musicId' });
Music.hasMany(PlaylistItem, { foreignKey: 'musicId' });

Music.hasMany(Play, { foreignKey: 'musicId' });
Play.belongsTo(Music, { foreignKey: 'musicId' });

sequelize.sync({ alter: true }).then(() => {
  console.log('Database synced successfully!');
});

const multer = require('multer');

// File Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'musicFile') {
      cb(null, './public/uploads');
    } else if (file.fieldname === 'artwork') {
      cb(null, './public/artworks');
    }
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
app.get('/recently-listened', async (req, res) => {
  const { userId } = req.session; // Assuming userId is stored in the session

  try {
    // Fetch recently listened songs from the Play table
    const recentlyListened = await Play.findAll({
      where: { userId },
      include: [
        {
          model: Music,
          attributes: ['id', 'title', 'artist', 'genre', 'releaseDate', 'filePath', 'artworkPath'],
        },
      ],
      order: [['playDate', 'DESC']], // Sort by most recent
      limit: 10, // Limit to 10 recently listened songs
    });

    const songs = recentlyListened.map(play => play.Music); // Extract song data
    res.json(songs);
  } catch (error) {
    console.error('Error fetching recently listened songs:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/playlists/mood/:mood', async (req, res) => {
  const { mood } = req.params;

  try {
    // Fetch songs that match the selected mood
    const songs = await Music.findAll({
      where: { mood },
      order: [['tempo', 'DESC']], // Sort by tempo for better user experience
    });

    // Return songs as a JSON response
    res.json(songs);
  } catch (error) {
    console.error('Error fetching mood-based playlist:', error);
    res.status(500).send('Internal Server Error');
  }
});


const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10 MB
}).fields([
  { name: 'musicFile', maxCount: 1 },
  { name: 'artwork', maxCount: 1 },
]);

// Upload Endpoint
app.post('/upload', upload, async (req, res) => {
  try {
    const { title, artist, genre, releaseDate } = req.body;
    const musicFile = req.files['musicFile'][0];
    const artworkFile = req.files['artwork'] ? req.files['artwork'][0] : null;

    const newMusic = {
      title,
      artist,
      genre,
      releaseDate,
      filePath: `/uploads/${musicFile.filename}`,
      artworkPath: artworkFile ? `/artworks/${artworkFile.filename}` : null,
    };

    await Music.create(newMusic);
    res.status(201).send('Music uploaded successfully!');
  } catch (error) {
    console.error('Error uploading music:', error);
    res.status(500).send('Failed to upload music');
  }
});
app.get('/downloads/most', async (req, res) => {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const mostDownloadedSongs = await Music.findAll({
      where: {
        updatedAt: { [Sequelize.Op.gte]: oneWeekAgo }, // Downloads recorded in the last week
      },
      order: [['downloads', 'DESC']], // Sort by download count (highest to lowest)
      limit: 10, // Optional: Limit to top 10 songs
    });

    res.json(mostDownloadedSongs);
  } catch (error) {
    console.error('Error fetching Most Downloaded Songs:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/download/:musicId', async (req, res) => {
  const { musicId } = req.params;

  try {
    const music = await Music.findByPk(musicId);

    if (!music) {
      return res.status(404).send('Music not found');
    }

    // Increment downloads count
    music.downloads += 1;
    await music.save();

    // Send file for download
    const filePath = path.join(__dirname, 'public', music.filePath);
    res.download(filePath, `${music.title}.mp3`);
  } catch (error) {
    console.error('Error downloading music:', error);
    res.status(500).send('Internal Server Error');
  }
});
app.post('/music/:id/play', async (req, res) => {
  const { id } = req.params;

  try {
    // Find the song by ID
    const song = await Music.findByPk(id);

    if (!song) {
      return res.status(404).send('Song not found');
    }

    // Increment playCount
    await song.increment('playCount');

    res.status(200).send('Play count updated');
  } catch (error) {
    console.error('Error updating play count:', error);
    res.status(500).send('Internal Server Error');
  }
});
app.get('/recently-listened', async (req, res) => {
  const userId = req.session.userId; // Assuming the userId is stored in the session

  try {
    // Fetch recently listened songs
    const recentlyListened = await Play.findAll({
      where: { userId },
      include: [
        {
          model: Music,
          attributes: ['id', 'title', 'artist', 'genre', 'releaseDate', 'filePath', 'artworkPath'],
        },
      ],
      order: [['playDate', 'DESC']], // Sort by most recent
      limit: 10, // Fetch the last 10 songs
    });

    const songs = recentlyListened.map(play => play.Music); // Extract song data from the Play model
    res.json(songs);
  } catch (error) {
    console.error('Error fetching recently listened songs:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/favorites/add', async (req, res) => {
  const { userId, musicId } = req.body;

  try {
    // Validate inputs
    if (!userId || !musicId) {
      return res.status(400).send('UserId and MusicId are required');
    }

    // Add to favorites
    const favorite = await Favorite.create({ userId, musicId });
    res.status(201).json({ message: 'Song added to favorites', favorite });
  } catch (error) {
    console.error('Error adding to favorites:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/favorites/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch favorite songs for the given userId
    const favorites = await Favorite.findAll({
      where: { userId }, // Filter by user ID
      include: [Music], // Include Music model to fetch song details
    });

    if (!favorites.length) {
      return res.status(404).send('No favorite tracks found for this user');
    }

    res.json(favorites); // Send favorite songs to the frontend
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/favorites/toggle', async (req, res) => {
  const { userId } = req.session; // Ensure the user is logged in
  const { musicId } = req.body;

  if (!userId || !musicId) {
    return res.status(400).send('Missing userId or musicId');
  }

  try {
    const favorite = await Favorite.findOne({ where: { userId, musicId } });

    if (favorite) {
      // If the favorite already exists, remove it (toggle off)
      await favorite.destroy();
      res.status(200).send('Removed from favorites');
    } else {
      // If the favorite doesn't exist, create it (toggle on)
      await Favorite.create({ userId, musicId });
      res.status(201).send('Added to favorites');
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/songs-of-the-week', async (req, res) => {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const songsOfTheWeek = await Music.findAll({
      where: {
        uploadDate: { [Sequelize.Op.gte]: oneWeekAgo }, // Tracks uploaded within the last week
      },
      order: [['downloads', 'DESC']], // Sort by download count
      limit: 10, // Optional: Limit to top 10 songs
    });

    res.json(songsOfTheWeek);
  } catch (error) {
    console.error('Error fetching Songs of the Week:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Create a Playlist
app.post('/playlists/create', async (req, res) => {
  const { name } = req.body;
  const userId = req.session.userId; // Get userId from the session

  if (!userId) {
    return res.status(401).send('Unauthorized: Please log in first.');
  }

  try {
    const playlist = await Playlist.create({ name, userId });
    res.status(201).json({ message: 'Playlist created successfully', playlist });
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Add a Song to a Playlist
app.post('/playlists/add', async (req, res) => {
  const { userId } = req.session; // Ensure the user is logged in
  const { playlistId, musicId } = req.body;

  if (!userId || !playlistId || !musicId) {
    return res.status(400).send('Missing userId, playlistId, or musicId');
  }

  try {
    const playlistItem = await PlaylistItem.create({ playlistId, musicId });
    res.status(201).send('Song added to playlist');
  } catch (error) {
    console.error('Error adding to playlist:', error);
    res.status(500).send('Internal Server Error');
  }
});


// Fetch User Playlists with Songs
app.get('/playlists/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const playlists = await Playlist.findAll({
      where: { userId },
      include: [{ model: PlaylistItem, include: [Music] }], // Include associated songs
    });

    res.json(playlists);
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).send('Internal Server Error');
  }
});
app.get('/top-charts', async (req, res) => {
  try {
    const topCharts = await Music.findAll({
      order: [['downloads', 'DESC']], // Ranking tracks by downloads
      limit: 10, // Optional: Limit to top 10 songs
    });

    res.json(topCharts);
  } catch (error) {
    console.error('Error fetching Top Charts:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Music endpoint for recently uploaded songs
app.get('/music', async (req, res) => {
  const page = parseInt(req.query.page) || 1; // Current page, default to 1
  const limit = parseInt(req.query.limit) || 10; // Number of songs per page, default to 10
  const offset = (page - 1) * limit; // Calculate offset

  try {
    const totalSongs = await Music.count(); // Get total number of songs
    const songs = await Music.findAll({
      order: [['uploadDate', 'DESC']], // Most recently uploaded first
      limit,
      offset,
    });

    // Send paginated data and metadata
    res.json({
      songs,
      currentPage: page,
      totalPages: Math.ceil(totalSongs / limit),
    });
  } catch (error) {
    console.error('Error fetching paginated music:', error);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/playlists/suggestions/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch top downloaded tracks
    const downloads = await Music.findAll({
      where: { downloads: { [Sequelize.Op.gt]: 0 } }, // Songs with downloads > 0
      order: [['downloads', 'DESC']],
      limit: 5,
    });

    // Fetch recently played tracks by the user
    const recentlyPlayed = await Play.findAll({
      where: { userId },
      include: [Music], // Include song details
      order: [['playDate', 'DESC']],
      limit: 5,
    });

    // Fetch frequently listened artists based on play count
    const frequentlyListenedArtists = await Play.findAll({
      attributes: [
        'musicId',
        [Sequelize.fn('COUNT', Sequelize.col('musicId')), 'playCount'],
      ],
      group: ['musicId'], // Group by music ID
      order: [[Sequelize.literal('playCount'), 'DESC']],
      limit: 5,
      include: [Music], // Include Music details
    });

    // Fetch songs based on recent searches
    const recentSearches = await Music.findAll({
      where: { title: { [Sequelize.Op.like]: '%searchQuery%' } }, // Replace "searchQuery" dynamically
      limit: 5,
    });

    // Combine results into playlist suggestions
    const playlistSuggestions = [
      ...downloads,
      ...recentlyPlayed.map(item => item.Music), // Map to Music details
      ...frequentlyListenedArtists.map(item => item.Music),
      ...recentSearches,
    ];

    res.json(playlistSuggestions); // Send combined results to the frontend
  } catch (error) {
    console.error('Error fetching playlist suggestions:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/playlists/:playlistId/play', async (req, res) => {
  const { playlistId } = req.params;

  try {
    // Fetch songs in the playlist
    const playlistSongs = await PlaylistItem.findAll({
      where: { playlistId },
      include: [Music], // Include song details
    });

    const genres = playlistSongs.map(item => item.Music.genre);
    const artists = playlistSongs.map(item => item.Music.artist);

    // Generate recommendations based on genres and artists
    const recommendations = await Music.findAll({
      where: {
        [Sequelize.Op.or]: [
          { genre: { [Sequelize.Op.in]: genres } }, // Songs matching genres
          { artist: { [Sequelize.Op.in]: artists } }, // Songs matching artists
        ],
      },
      limit: 10, // Limit to top 10 recommendations
    });

    res.json({
      playlistSongs: playlistSongs.map(item => item.Music), // Songs in the playlist
      recommendations, // Suggested songs
    });
  } catch (error) {
    console.error('Error fetching playlist songs and recommendations:', error);
    res.status(500).send('Internal Server Error');
  }
});
app.get('/playlists/curated', async (req, res) => {
  try {
    const relaxingVibes = await Music.findAll({ where: { genre: 'Ambient' }, limit: 20 });
    const workoutHits = await Music.findAll({ where: { genre: 'Electronic' }, limit: 20 });

    const userId = req.session.userId;
    const aiGenerated = await Music.findAll({
      where: { userId }, // Generate personalized recommendations
      limit: 20,
    });

    res.json({
      curated: {
        relaxingVibes,
        workoutHits,
      },
      aiGenerated,
    });
  } catch (error) {
    console.error('Error fetching curated playlists:', error);
    res.status(500).send('Internal Server Error');
  }
});
app.get('/user-analytics/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const mostPlayedGenres = await Play.findAll({
      attributes: ['genre', [Sequelize.fn('COUNT', Sequelize.col('genre')), 'playCount']],
      group: ['genre'],
      order: [[Sequelize.literal('playCount'), 'DESC']],
      limit: 5,
    });

    const mostPlayedSongs = await Play.findAll({
      where: { userId },
      include: [Music],
      order: [['playDate', 'DESC']],
      limit: 5,
    });

    const favoriteArtists = await Music.findAll({
      attributes: ['artist', [Sequelize.fn('COUNT', Sequelize.col('artist')), 'frequency']],
      group: ['artist'],
      order: [[Sequelize.literal('frequency'), 'DESC']],
      limit: 5,
    });

    res.json({ mostPlayedGenres, mostPlayedSongs, favoriteArtists });
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/music', async (req, res) => {
  try {
    // Fetch all songs from the database
    const musicData = await Music.findAll({
      attributes: ['id', 'title', 'artist', 'genre', 'releaseDate', 'filePath', 'artworkPath', 'tempo'], // Include relevant fields
      order: [['releaseDate', 'DESC']], // Sort by release date (most recent first)
    });

    res.json(musicData); // Send data as JSON
  } catch (error) {
    console.error('Error fetching music:', error);
    res.status(500).send('Internal Server Error');
  }
});
app.get('/smart-shuffle/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Example logic: Fetch user's most-played genres and suggest songs
    const userGenres = await Play.findAll({
      attributes: ['genre', [Sequelize.fn('COUNT', Sequelize.col('genre')), 'playCount']],
      where: { userId },
      group: ['genre'],
      order: [[Sequelize.literal('playCount'), 'DESC']],
    });

    const topGenres = userGenres.map(item => item.genre);

    const suggestedSongs = await Music.findAll({
      where: { genre: { [Sequelize.Op.in]: topGenres } },
      limit: 10, // Limit to top 10 suggestions
    });

    res.json(suggestedSongs);
  } catch (error) {
    console.error('Error fetching smart shuffle playlist:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/top-artists', async (req, res) => {
  try {
    const topArtists = await Music.findAll({
      attributes: [
        'artist',
        [Sequelize.fn('SUM', Sequelize.col('downloads')), 'totalDownloads'], // Aggregates downloads by artist
      ],
      group: ['artist'], // Group by artist
      order: [[Sequelize.literal('"totalDownloads"'), 'DESC']], // Sort by alias (use literal for dynamic field)
      limit: 5, // Show top 5 artists
    });

    res.json(topArtists);
  } catch (error) {
    console.error('Error fetching Top Artists:', error);
    res.status(500).send('Internal Server Error');
  }
});
app.get('/search', async (req, res) => {
  const { query } = req.query; // Retrieve the search query from the request

  try {
    const results = await Music.findAll({
      where: {
        [Sequelize.Op.or]: [
          { title: { [Sequelize.Op.iLike]: `%${query}%` } }, // Case-insensitive search for title
          { artist: { [Sequelize.Op.iLike]: `%${query}%` } }, // Case-insensitive search for artist
        ],
      },
    });

    res.json(results);
  } catch (error) {
    console.error('Error fetching search results:', error);
    res.status(500).send('Internal Server Error');
  }
});
app.get('/recommendations/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch genres from the user's favorited songs
    const userGenres = await Favorite.findAll({
      attributes: [],
      include: [
        {
          model: Music,
          attributes: ['genre'], // Only fetch the genre
        },
      ],
      where: { userId },
    });

    // Extract genres
    const genres = userGenres.map(item => item.Music.genre);

    // Recommend songs based on genres
    const recommendations = await Music.findAll({
      where: { genre: { [Sequelize.Op.in]: genres } },
      limit: 10, // Limit to 10 recommendations
    });

    res.json(recommendations);
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/user-analytics/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch user's most downloaded songs
    const analytics = await Music.findAll({
      attributes: ['title', 'downloads'],
      include: [
        {
          model: Favorite,
          where: { userId },
        },
      ],
      order: [['downloads', 'DESC']],
    });

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    res.status(500).send('Internal Server Error');
  }
});


// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).send('Internal Server Error');
});
app.use((req, res, next) => {
  if (!req.session.userId && req.path !== '/login' && req.path !== '/register') {
    return res.redirect('/login');
  }
  next();
});
// Logout Endpoint
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Failed to logout');
    }
    res.status(200).send('Logout successful!');
  });
});

// Login Endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Find the user in the database
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).send('Invalid username or password');
    }

    // Check the password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).send('Invalid username or password');
    }

    // Store userId in session
    req.session.userId = user.id;

    // Redirect to index.html after successful login
    res.redirect('/index.html');
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).send('Internal Server Error');
  }
});

const bcrypt = require('bcryptjs');

// Registration Endpoint
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if the username already exists
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).send('Username is already taken');
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user
    await User.create({ username, password: hashedPassword });

    // Redirect to index.html after successful registration
    res.redirect('/index.html');
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/files/:id', async (req, res) => {
  const { id } = req.params;
  const music = await Music.findByPk(id);

  if (!music || !music.filePath) {
    return res.status(404).send('File not found');
  }

  const filePath = path.join(__dirname, 'public', music.filePath);
  res.sendFile(filePath);
});

// Test Route
app.get('/', (req, res) => res.send('Welcome to Hot Music Tracks!'));

// Start Server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
