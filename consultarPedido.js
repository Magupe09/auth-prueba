const { Pool } = require('pg');

const config = {
    user: 'postgres',
    host: 'localhost',
    database: 'pizzeria',
    password: 'Ciberdelux',
    port: 5432,
};

const pool = new Pool(config);

async function consultarPedidos() {
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
            WHERE o.order_id = 4
          `);
        console.log(resultado.rows);
    } catch (err) {
        console.error('Error en la consulta:', err);
    }
}
consultarPedidos();