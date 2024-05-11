The server is up [here](energymonitor.leoshatrushin.com), but it's password-protected.

#How it works
- ESP32 code is in esp/
- ESP32 uses a photoresistor to detect light flashes on an energy meter
- Sends a timestamp over TCP+TLS to the server every time
- NGINX handles TLS and forwards
- Server code is in backend/
- Server saves timestamps and builds up indexes
- Server streams live timestamps and responds to requests from frontend via application-level protocol over websockets
- The frontend code is in web/
- NGINX handles HTTPS and forwards
- The API and indexes for viewing arbitrary graphs is implemented in the backend but only viewing live data is implemented in the frontend
