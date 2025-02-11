document.addEventListener('DOMContentLoaded', () => {
    fetch('/uploads')
      .then(response => response.json())
      .then(data => {
        const musicList = document.querySelector('.music-list');
        data.forEach(music => {
          const musicDiv = document.createElement('div');
          musicDiv.innerHTML = `
            <h3>${music.title}</h3>
            <p>Artist: ${music.artist}</p>
            <p>Genre: ${music.genre}</p>
            <p>Release Date: ${music.releaseDate}</p>
            <audio controls>
              <source src="uploads/${music.filename}" type="audio/mpeg">
              Your browser does not support the audio element.
            </audio>
          `;
          musicList.appendChild(musicDiv);
        });
      })
      .catch(error => console.error('Error fetching music:', error));
  });
  