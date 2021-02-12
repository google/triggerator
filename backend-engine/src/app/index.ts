let argv = require('yargs/yargs')(process.argv.slice(2)).argv;
import app from './app';

async function mainServer() { 
    const PORT = argv.port || process.env.PORT || 8080;
    app.listen(PORT, () => {
        console.log(`Web server is listening on ${PORT}`)
    });
}

mainServer().catch(console.error);
