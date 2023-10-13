import jsonwebtoken from 'jsonwebtoken'
import { configDotenv } from "dotenv";
import { createAccessToken } from "../utils/tokenUtils.js";
import util from 'util'
import {rotateRefreshToken} from "../services/tokenRotation.js";

configDotenv()

const verifyAsync = util.promisify(jsonwebtoken.verify)

export function verifyToken(req, res, next) {
    if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
        jsonwebtoken.verify(req.headers.authorization.split(' ')[1], process.env.ACCESS_TOKEN_SECRET, async (err, decoded) => {
            if (err) {
                if (err instanceof jsonwebtoken.TokenExpiredError) {
                    const refreshToken = req.cookies['refreshToken'];

                    if (!refreshToken) return res.status(401).send({ message: "Access Denied. No refresh token provided" });

                    try {
                        // const decodedRefreshToken = jsonwebtoken.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET)
                        // Seda pole vaja aga selline asi ka võimalik.. Siin ta returnib Promise
                        const decodedRefreshToken = await verifyAsync(refreshToken, process.env.REFRESH_TOKEN_SECRET)

                        const currentTimeStamp = Math.floor(Date.now() / 1000)
                        if (decodedRefreshToken.exp <= currentTimeStamp) {
                            return res.status(401).send({ message: 'Access Denied. Refresh token has expired.' }) //login required
                        }

                        req.user = { id: decodedRefreshToken.id, role: decodedRefreshToken.role };
                        const newAccessToken = createAccessToken(decodedRefreshToken.id, decodedRefreshToken.role)
                        await rotateRefreshToken(req, res)

                        req.header.authorization = `Bearer ${newAccessToken}`;
                        next()
                    } catch (e) {
                        return res.status(400).send({ message: "Unable to verify the refreshToken", error: e })
                    }
                }
                // // invalid token (tampered)
                // return res.status(400).send({ message: "Invalid token, please provide a valid refresh token!"})
            }
            if (decoded) {
                // const user = await db.collection('User').findOne({ _id: new ObjectId(decoded.id) });
                // if (!user) req.user = undefined
                req.user = { id: decoded.id, role: decoded.role };
                next()
            }
        });
    } else {
        req.user = undefined;
        next()
    }
}

// TODO Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client
export function isAdmin(req, res, next) {
    if (req.user.role === 'admin') {
        next()
    } else return res.status(401).send({ message: "Unauthorized!" })
}

export function isUser(req, res, next) {
    if (req.user.role === 'user' || req.user.role === 'admin') {
        next()
    } else return res.status(401).send({ message: "Unauthorized!" })
}
