// Wrapper: change CWD to project root before starting Next.js dev server
process.chdir('C:\\eiai-hub');
process.argv = [process.argv[0], process.argv[1], 'dev', '--port', '3000'];
require('./node_modules/next/dist/bin/next');
