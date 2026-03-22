const net = require('net');
const client = new net.Socket();
const host = '104.154.131.71';
const port = 5432;

console.log('Connecting to ' + host + ':' + port + '...');
client.connect(port, host, function() {
	console.log('TCP Connection established!');
	client.destroy();
});

client.on('error', function(err) {
	console.error('Connection failed: ' + err.message);
});

client.on('close', function() {
	console.log('Connection closed');
});
