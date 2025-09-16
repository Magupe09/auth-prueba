const bcrypt = require('bcrypt');

const password = 'miSuperClave123';
const passwordIncorrecta = 'otraClave321';

bcrypt.hash(password, 10, (err, hash) => {
    if (err) throw err;
    const hashGuardado = hash;;


    bcrypt.compare(password, hashGuardado, (err, result) => {
        if (result) {
            console.log('✅ Contraseña válida');
        } else {
            console.log('❌ Contraseña incorrecta');
        }
    });
    bcrypt.compare(passwordIncorrecta, hashGuardado, (err, result) => {
        if (err) throw err;
        if (result) {
            console.log('✅ Contraseña válida');
        } else {
            console.log('❌ Contraseña incorrecta');
        }
    });

});