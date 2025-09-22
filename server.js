// --- IMPORTACIONES ---
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

// --- CONSTANTES Y CONFIGURACIONES ---
const app = express();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const PORT = process.env.PORT || 4000;

const corsOptions = {
    origin: 'http://localhost:5173', // Para desarrollo local
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// --- MIDDLEWARE ---
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ error: 'Acceso denegado. No se proporcionó token de autenticación.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido o expirado. Acceso prohibido.' });
        }
        req.user = user;
        next();
    });
};

// --- RUTAS DE LA API ---

// Ruta de bienvenida
app.get('/', (req, res) => {
    res.send('¡Hola, Mauricio! Tu API ya responde 🚀');
});

// Autenticación con Google
app.post('/auth/google', async (req, res) => {
    const { token: idToken } = req.body;

    if (!idToken) {
        return res.status(400).json({ error: 'Token de Google no proporcionado.' });
    }

    try {
        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        const userCheckQuery = 'SELECT user_id FROM users WHERE email = $1';
        const userCheckResult = await pool.query(userCheckQuery, [email]);
        let userId;

        if (userCheckResult.rows.length > 0) {
            userId = userCheckResult.rows[0].user_id;
        } else {
            const insertUserQuery = `
                INSERT INTO users (name, email)
                VALUES ($1, $2)
                RETURNING user_id;
            `;
            const insertResult = await pool.query(insertUserQuery, [name, email]);
            userId = insertResult.rows[0].user_id;
        }

        const token = jwt.sign(
            { userId: userId, email: email },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({
            mensaje: 'Login con Google exitoso.',
            user_id: userId,
            token: token
        });

    } catch (err) {
        console.error('Error al autenticar con Google:', err);
        res.status(500).json({ error: 'Error interno del servidor durante la autenticación con Google.' });
    }
});

// Registro de usuario
app.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Todos los campos (nombre, email, contraseña) son obligatorios.' });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'El formato del email no es válido.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
        }

        const existingUser = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'El email ya está registrado. Intenta iniciar sesión o usa otro email.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUserResult = await pool.query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING user_id, name, email, created_at',
            [name, email, hashedPassword]
        );

        res.status(201).json({
            message: 'Usuario registrado exitosamente',
            user: newUserResult.rows[0]
        });

    } catch (err) {
        console.error('Error al registrar usuario:', err);
        res.status(500).json({ error: 'Error interno del servidor al intentar registrar el usuario.' });
    }
});

// Login de usuario
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Faltan credenciales. Por favor, proporciona email y contraseña.' });
        }

        const resultado = await pool.query('SELECT user_id, password FROM users WHERE email = $1', [email]);
        if (resultado.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const usuario = resultado.rows[0];
        const passwordCorrecta = await bcrypt.compare(password, usuario.password);

        if (!passwordCorrecta) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const token = jwt.sign(
            { userId: usuario.user_id, email: email },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({
            mensaje: 'Login exitoso',
            user_id: usuario.user_id,
            token: token
        });

    } catch (err) {
        console.error('Error en el proceso de login:', err);
        res.status(500).json({ error: 'Error interno del servidor al intentar iniciar sesión.' });
    }
});

// Obtener historial de pedidos de un usuario (protegido por JWT)
app.get('/users/:userId/orders', authenticateToken, async (req, res) => {
    const userId = parseInt(req.params.userId, 10);

    if (req.user.userId !== userId) {
        return res.status(403).json({ error: 'Acceso prohibido. No tienes permiso para ver los pedidos de este usuario.' });
    }

    if (isNaN(userId) || userId <= 0) {
        return res.status(400).json({ error: 'ID de usuario inválido. Debe ser un número positivo.' });
    }

    try {
        const result = await pool.query(`
            SELECT
              o.order_id,
              o.created_at AS order_date,
              p.name AS product_name,
              oi.quantity,
              oi.price_at_purchase
            FROM orders o
            JOIN order_items oi ON o.order_id = oi.order_id
            JOIN products p ON oi.product_id = p.product_id
            WHERE o.user_id = $1
            ORDER BY o.created_at DESC, o.order_id, p.name;
        `, [userId]);

        if (result.rows.length === 0) {
            const userCheck = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
            if (userCheck.rows.length === 0) {
                return res.status(404).json({ message: 'Usuario no encontrado.' });
            }
            return res.status(200).json([]);
        }

        const ordersHistory = {};
        result.rows.forEach(row => {
            if (!ordersHistory[row.order_id]) {
                ordersHistory[row.order_id] = {
                    order_id: row.order_id,
                    order_date: row.order_date,
                    items: []
                };
            }
            ordersHistory[row.order_id].items.push({
                product_name: row.product_name,
                quantity: row.quantity,
                price_at_purchase: row.price_at_purchase
            });
        });

        const formattedResponse = Object.values(ordersHistory);
        res.json(formattedResponse);

    } catch (err) {
        console.error('Error al obtener el historial de pedidos:', err);
        res.status(500).json({ error: 'Error interno del servidor al obtener el historial de pedidos.' });
    }
});

// Obtener un pedido por ID
app.get('/orders/:id', async (req, res) => {
    const orderId = req.params.id;
    try {
        const resultado = await pool.query(`
            SELECT
              o.order_id,
              o.user_id,
              p.name AS producto,
              p.price,
              oi.quantity
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.order_id
            JOIN products p ON oi.product_id = p.product_id
            WHERE o.order_id = ${orderId}
        `);
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener el pedido' });
    }
});


// Crear un nuevo pedido
// En tu archivo server.js
// Crear un nuevo pedido
app.post('/orders', authenticateToken, async (req, res) => { // AÑADE EL MIDDLEWARE AQUÍ
        const client = await pool.connect();
    
        try {
            await client.query('BEGIN');
    
            // OBTÉN EL userId DEL TOKEN, NO DEL req.body
            const userId = req.user.userId;
    
            // El resto del cuerpo de la solicitud (items) sigue siendo el mismo
            const { items } = req.body;
            
            // Validaciones de items
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'El pedido debe contener al menos un item.' });
            }
    
            for (const item of items) {
                if (!item.pizzaId || typeof item.pizzaId !== 'number' || item.pizzaId <= 0) {
                    return res.status(400).json({ error: `El pizzaId para un item es requerido y debe ser un número positivo. Problema en item: ${JSON.stringify(item)}` });
                }
                if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
                    return res.status(400).json({ error: `La quantity para un item es requerida y debe ser un número positivo. Problema en item: ${JSON.stringify(item)}` });
                }
                if (!item.size || typeof item.size !== 'string') {
                    return res.status(400).json({ error: `El tamaño (size) es requerido para un item. Problema en item: ${JSON.stringify(item)}` });
                }
            }
    
            // 1. Insertar el pedido principal en la tabla `orders`
            const orderResult = await client.query('INSERT INTO orders (user_id) VALUES ($1) RETURNING order_id', [userId]);
            const orderId = orderResult.rows[0].order_id;
    
            // 2. Insertar cada ítem del pedido en la tabla `order_items`
            for (const item of items) {
                const { pizzaId, quantity, size } = item;
                const productQuery = await client.query('SELECT precio FROM pizza_precios WHERE pizza_id = $1 AND tamano = $2', [pizzaId, size]);
                
                if (productQuery.rows.length === 0) {
                    throw new Error(`Producto con ID ${pizzaId} y tamaño ${size} no encontrado.`);
                }
                
                const priceAtPurchase = productQuery.rows[0].precio;
    
                await client.query(
                    'INSERT INTO order_items (order_id, pizza_id, quantity, price) VALUES ($1, $2, $3, $4)', 
                    [orderId, pizzaId, quantity, priceAtPurchase]
                );
            }
    
            await client.query('COMMIT');
            res.status(201).json({ message: 'Pedido creado exitosamente', orderId: orderId });
    
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al crear el pedido:', error);
            if (error.message.startsWith('Producto con ID')) {
                return res.status(404).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno al procesar el pedido. Intente nuevamente.' });
        } finally {
            client.release();
        }
    });













/*
app.post('/orders', async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const { userId, items } = req.body;

        // Validaciones generales del pedido
        if (!userId || typeof userId !== 'number' || userId <= 0) {
            return res.status(400).json({ error: 'El userId es requerido y debe ser un número válido.' });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'El pedido debe contener al menos un item.' });
        }

        // Validar cada ítem del pedido
        for (const item of items) {
            if (!item.pizzaId || typeof item.pizzaId !== 'number' || item.pizzaId <= 0) {
                return res.status(400).json({ error: `El pizzaId para un item es requerido y debe ser un número positivo. Problema en item: ${JSON.stringify(item)}` });
            }
            if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
                return res.status(400).json({ error: `La quantity para un item es requerida y debe ser un número positivo. Problema en item: ${JSON.stringify(item)}` });
            }
            // AÑADIMOS VALIDACIÓN PARA EL TAMAÑO
            if (!item.size || typeof item.size !== 'string') {
                return res.status(400).json({ error: `El tamaño (size) es requerido para un item. Problema en item: ${JSON.stringify(item)}` });
            }
        }

        // 1. Insertar el pedido principal en la tabla `orders`
        const orderResult = await client.query('INSERT INTO orders (user_id) VALUES ($1) RETURNING order_id', [userId]);
        const orderId = orderResult.rows[0].order_id;

        // 2. Insertar cada ítem del pedido en la tabla `order_items`
        for (const item of items) {
            const { pizzaId, quantity, size } = item;
            
            // CORREGIMOS la consulta para que busque en la nueva tabla `pizza_precios` por el tamaño
            const productQuery = await client.query('SELECT precio FROM pizza_precios WHERE pizza_id = $1 AND tamano = $2', [pizzaId, size]);
            if (productQuery.rows.length === 0) {
                throw new Error(`Producto con ID ${pizzaId} y tamaño ${size} no encontrado.`);
            }
            
            const priceAtPurchase = productQuery.rows[0].precio;

            // CORREGIMOS la consulta para que use 'pizza_id'
            await client.query(
                'INSERT INTO order_items (order_id, pizza_id, quantity, price) VALUES ($1, $2, $3, $4)', 
                [orderId, pizzaId, quantity, priceAtPurchase]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Pedido creado exitosamente', orderId: orderId });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al crear el pedido:', error);
        if (error.message.startsWith('Producto con ID')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Error interno al procesar el pedido. Intente nuevamente.' });
    } finally {
        client.release();
    }
});

*/



// Obtener todos los productos

app.get('/products', async (req, res) => {
    try {
      const productsQuery = `
        SELECT
            p.pizza_id,
            p.nombre,
            p.imagen,
            -- Subconsulta para obtener los ingredientes desde la tabla que sí tienes
            (
                SELECT JSONB_AGG(pi.ingrediente)
                FROM pizza_ingredientes pi
                WHERE pi.pizza_id = p.pizza_id
            ) AS ingredientes,
            -- Subconsulta para obtener los precios
            (
                SELECT JSONB_AGG(jsonb_build_object('tamano', pp.tamano, 'precio', pp.precio))
                FROM pizza_precios pp
                WHERE pp.pizza_id = p.pizza_id
            ) AS precios
        FROM
            pizzas p
        GROUP BY
            p.pizza_id
        ORDER BY
            p.pizza_id;
      `;
      
      const result = await pool.query(productsQuery);
      res.json(result.rows);
    } catch (err) {
      console.error("Error al obtener productos:", err);
      res.status(500).json({ error: "Error al obtener productos" });
    }
  });

  
// --- MANEJO DE ERRORES Y SERVIDOR ---
app.use((req, res) => {
    res.status(404).send('Ruta no encontrada');
});

app.listen(PORT, () => console.log(`Servidor listo en http://localhost:${PORT}`));