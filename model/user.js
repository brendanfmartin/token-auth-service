'use strict'
const Promise = require('bluebird');
const ModelHandler = require('./ModelHandler');
const session = require('./session');
const token = require('./token');

const schema = {
    username: {
        type: String,
        required: true,
        min: 4
    },
    password: {
        type: String,
        required: true,
        min: 8
    }
};
/* SCHEMA */

/* RELATIONSHIPS */
const relationships = [
    {
        model: session.model,
        objLabel: 'sessions',
        relName: 'has_session'
    }
];

/* COMPOSE RELATIONSHIPS */
const compose = function(){
    relationships.forEach(function(rel){
        model.compose(
            rel.model(),
            rel.objLabel,
            rel.relName
        )
    })
};

/* CREATE INSTANCE OF MODEL */
const AuthUserHandler = new ModelHandler('AuthUser', schema);
var model;

/* INITIALIZE */
module.exports.init = function(db){
    AuthUserHandler.init(db);
    model = Promise.promisifyAll(AuthUserHandler.getModel(), {suffix: 'Prom'});

    session.init(db, model);
    compose();
};

/* CREATE NEW AUTH USER */
module.exports.create = function(username, password){
    return new Promise(function(resolve, reject){
        // Ensure username provided
        if(username == undefined){
            return reject({
                message: 'Username validation failed'
            });
        }

        model.whereProm({
            username: username
        })
        .then(function(nodes){
            if(nodes.length > 0){
                return reject({
                    message: 'User already exists'
                });
            }

            // Add credentials to database
            return model.saveProm({
                username: username,
                password: password
            });
        })
        .then(function(data){
            return resolve(data.id);
        })
        .catch(function(err){
            // Not validation error
            if(err.cause == undefined){
                return reject(err);
            }

            // Cleaner validation errors
            const message = err.cause.toString();
            if(message.includes('validation failed when parsing `username`')){
                return reject({
                    message: "Username validation failed"
                });
            }


            if(message.includes('validation failed when parsing `password`')){
                return reject({
                    message: "Password validation failed"
                });
            }

            // Unknown validation error - safety
            return reject(err);
        });
    });
};

/* CREATE NEW USER SESSION */
module.exports.createSession = function(username, password){
    return new Promise(function(fulfill, reject){
        const credentials = {
            username: username
        };

        if(password != undefined){
            credentials.password = password;
        }

        // Check credentials
        return model.whereProm(credentials, {limit:1})
        .then(function(node){
            if(!node.length){
                throw {
                    message: 'Bad credentials'
                };
            }

            // Create new session
            return session.create(node[0].id);
        })
        .then(function(data){
            // Create new token using session data
            return token.create({
                username: username,
                sessionId: data.id,
                exp: data.expiry
            });
        })
        .then(function(token){
            return fulfill(token);
        })
        .catch(function(err){
            return reject(err);
        });
    });
};

/* VALIDATE USER SESSION */
module.exports.validateSession = function(username, sessionId){
    return session.validate(username, sessionId);
};

/* DELETE USER SESSION */
module.exports.deleteSession = function(sessionId){
    return session.delete(sessionId);
};

/* RETURN MODEL */
module.exports.model = function(){
    return model;
};
