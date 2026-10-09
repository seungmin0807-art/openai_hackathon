import {createServer} from '../server.mjs';
const server=createServer({env:{...process.env,DEPLOYMENT_MODE:'vercel',SERVE_STATIC:'false'},rateLimit:120});
export default function handler(req,res){return server.emit('request',req,res);}
export const config={api:{bodyParser:false}};
