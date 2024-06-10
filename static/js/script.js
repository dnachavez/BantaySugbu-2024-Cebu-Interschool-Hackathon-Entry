const permissionRequest = document.getElementById('permission-request');
const content = document.getElementById('content');
const notification = document.getElementById('notification');
const historyIcon = document.getElementById('history-icon-wrapper');
const mapsIcon = document.getElementById('maps-icon-wrapper');
const historySheet = document.getElementById('history-sheet');
const mapSheet = document.getElementById('map-sheet');
const closeHistoryBtn = document.getElementById('close-history');
const closeMapBtn = document.getElementById('close-map');
const historyList = document.getElementById('history-list');
let notificationTimeout;
let countdownInterval;
let isNotificationActive = false;

const map = L.map('map').setView([10.3157, 123.8854], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

function showNotification(label) {
    if (isNotificationActive && notification.querySelector('strong').innerText === label) {
        return;
    }

    if (isNotificationActive) {
        clearTimeout(notificationTimeout);
        clearInterval(countdownInterval);
    }

    isNotificationActive = true;
    
    let countdown = 5;
    notification.querySelector('strong').innerText = `${label}`;
    notification.querySelector('span').innerText = `Authorities will be notified if this notification is not closed within ${countdown} seconds.`;
    notification.style.backgroundColor = 'red';
    notification.style.display = 'block';
    
    countdownInterval = setInterval(() => {
        countdown -= 1;
        notification.querySelector('span').innerText = `Authorities will be notified if this notification is not closed within ${countdown} seconds.`;
        if (countdown === 1) {
            clearInterval(countdownInterval);
            requestAccurateGeolocation(label);
        }
    }, 1000);
}

function closeNotification() {
    notification.style.display = 'none';
    clearTimeout(notificationTimeout);
    clearInterval(countdownInterval);
    isNotificationActive = false;
}

notification.addEventListener('click', closeNotification);

function requestAccurateGeolocation(label) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => saveNotification(position, label),
            (error) => console.error('Error getting geolocation:', error),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    } else {
        console.log("Geolocation is not supported by this browser.");
    }
}

function saveNotification(position, label) {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const timestamp = new Date().toISOString().split('T')[0] + ' ' + new Date().toTimeString().split(' ')[0];
    fetch('/get_google_maps_api_key')
        .then(response => response.json())
        .then(data => {
            const apiKey = data.api_key;
            const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}`;
            fetch(url)
                .then(response => response.json())
                .then(data => {
                    if (data.results && data.results.length > 0) {
                        const address = data.results[0].formatted_address;
                        const notificationData = {
                            label: label,
                            address: address,
                            timestamp: timestamp
                        };
                        fetch('/save_notification', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(notificationData)
                        })
                        .then(response => response.json())
                        .then(data => {
                            console.log('Notification saved:', data);
                            if (data.status === 'success') {
                                notification.querySelector('strong').innerText = "Crime has been reported!";
                                notification.querySelector('span').innerText = "Authorities have been notified of the incident.";
                                notification.style.backgroundColor = 'green';
                                setTimeout(closeNotification, 5000);
                            } else if (data.status === 'duplicate') {
                                setTimeout(closeNotification, 5000);
                            }
                        })
                        .catch(error => console.error('Error saving notification:', error));
                    } else {
                        console.error('No address found for the given coordinates');
                    }
                })
                .catch(error => console.error('Error fetching address:', error));
        });
}

function getLabel() {
    if (isNotificationActive) return;
    
    fetch('/get_current_label')
        .then(response => response.json())
        .then(data => {
            const label = data.label;
            const currentTimestamp = Date.now();

            if (label && label !== 'NormalVideos') {
                showNotification(label);
            }
        })
        .catch(error => console.error('Error fetching current label:', error));
}

function requestGeolocationPermission() {
    navigator.geolocation.getCurrentPosition(
        (position) => {
            permissionRequest.style.display = 'none';
            content.style.display = 'block';
            setInterval(getLabel, 5000);
            startVideoFeed();
        },
        (error) => {
            alert('Geolocation permission is required for this application to function.');
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
}

historyIcon.addEventListener('click', () => {
    mapSheet.classList.remove('active');
    fetch('/get_history')
        .then(response => response.json())
        .then(data => {
            historyList.innerHTML = '';
            data.forEach(item => {
                const listItem = document.createElement('li');
                listItem.textContent = `${item.label} detected at ${item.address} on ${item.timestamp}`;
                historyList.appendChild(listItem);
            });
            historySheet.classList.add('active');
        })
        .catch(error => console.error('Error fetching history:', error));
});

closeHistoryBtn.addEventListener('click', () => {
    historySheet.classList.remove('active');
});

mapsIcon.addEventListener('click', () => {
    historySheet.classList.remove('active');
    map.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
            map.removeLayer(layer);
        }
    });
    fetch('/get_history')
        .then(response => response.json())
        .then(data => {
            fetch('/get_google_maps_api_key')
                .then(response => response.json())
                .then(apiData => {
                    const apiKey = apiData.api_key;
                    const promises = data.map(item => {
                        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(item.address)}&key=${apiKey}`;
                        return fetch(url)
                            .then(response => response.json())
                            .then(data => {
                                if (data.results && data.results.length > 0) {
                                    const { lat, lng } = data.results[0].geometry.location;
                                    L.marker([lat, lng], {
                                        icon: L.icon({
                                            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
                                            iconSize: [25, 41],
                                            iconAnchor: [12, 41],
                                            popupAnchor: [1, -34]
                                        })
                                    }).addTo(map)
                                    .bindPopup(`<b>${item.label}</b><br>${item.address}<br>${item.timestamp}`);
                                }
                            })
                            .catch(error => console.error('Error fetching coordinates:', error));
                    });
                    Promise.all(promises).then(() => {
                        mapSheet.classList.add('active');
                        map.invalidateSize();
                    });
                })
                .catch(error => console.error('Error fetching Google Maps API key:', error));
        })
        .catch(error => console.error('Error fetching history:', error));
});

closeMapBtn.addEventListener('click', () => {
    mapSheet.classList.remove('active');
});

function startVideoFeed() {
    const video = document.getElementById('video-feed');
    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: { ideal: "environment" }
        }
    }).then((stream) => {
        video.srcObject = stream;
        video.play();
        video.addEventListener('loadeddata', () => {
            captureFrame(video);
        });
    }).catch((error) => {
        console.log('Error accessing rear camera, trying front camera:', error);
        navigator.mediaDevices.getUserMedia({
            video: true
        }).then((stream) => {
            video.srcObject = stream;
            video.play();
            video.addEventListener('loadeddata', () => {
                captureFrame(video);
            });
        }).catch((error) => {
            console.error('Error accessing front camera:', error);
        });
    });
}

function captureFrame(video) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 224;
    canvas.height = 224;
    function sendFrame() {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            const formData = new FormData();
            formData.append('frame', blob);
            fetch('/video_feed', {
                method: 'POST',
                body: formData
            }).then(response => response.json())
            .then(data => {
                if (data.label && data.label !== 'NormalVideos') {
                    showNotification(data.label);
                }
                requestAnimationFrame(sendFrame);
            }).catch(error => console.error('Error sending frame:', error));
        }, 'image/jpeg');
    }
    requestAnimationFrame(sendFrame);
}
