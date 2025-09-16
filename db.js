const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const config = {
  user: 'postgres',
  host: 'localhost',
  database: 'pizzeria',
  password: 'Ciberdelux',
  port: 5432,
};

const pool = new Pool(config);

function crearUsuario(name, email, password) {
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      console.error('❌ Error al hashear la contraseña:', err);
      return;
    }

    // Insertar en la base de datos usando el hash
    const query = `
      INSERT INTO users (name, email, password)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;

    const values = [name, email, hash];

    pool.query(query, values, (err, res) => {
      if (err) {
        console.error('❌ Error al insertar el usuario:', err);
      } else {
        console.log('✅ Usuario creado:', res.rows[0]);
      }
    });
  });
}
function iniciarSesion(email, contraseñaIngresada) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const values = [email];
  
    pool.query(query, values, (err, res) => {
      if (err) {
        console.error('❌ Error en la consulta:', err);
        return;
      }
  
      if (res.rows.length === 0) {
        console.log('❌ Usuario no encontrado');
        return;
      }
  
      const usuario = res.rows[0];
  
      bcrypt.compare(contraseñaIngresada, usuario.password, (err, resultado) => {
        if (err) {
          console.error('❌ Error comparando la contraseña:', err);
        } else if (resultado) {
          console.log('✅ Login exitoso:', usuario.name);
        } else {
          console.log('❌ Contraseña incorrecta');
        }
      });
    });
  }
  

  function crearPedido(user_id, items, payment_method, delivery_address) {
    const query = `
      INSERT INTO orders (user_id, items, payment_method, delivery_address)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
  
    const values = [user_id, items, payment_method, delivery_address];
  
    pool.query(query, values, (err, res) => {
      if (err) {
        console.error('❌ Error al insertar el pedido:', err);
      } else {
        console.log('✅ Pedido guardado:', res.rows[0]);
      }
    });
  }
  function obtenerPedidosDeUsuario(user_id) {
    const query = `
      SELECT * FROM orders WHERE user_id = $1;
    `;
  
    pool.query(query, [user_id], (err, res) => {
      if (err) {
        console.error('❌ Error al obtener los pedidos:', err);
      } else if (res.rows.length === 0) {
        console.log('📭 Este usuario no tiene pedidos aún.');
      } else {
        console.log(`📦 Pedidos del usuario ${user_id}:`);
        res.rows.forEach((pedido) => {
          console.log('-', pedido.items, '|', pedido.payment_method);
        });
      }
    });
  }
  function crearPedidoConProductos(user_id, productos) {
    // 1. Crear el pedido vacío
    const pedidoQuery = `
      INSERT INTO orders (user_id, items, payment_method, delivery_address)
      VALUES ($1, $2, $3, $4)
      RETURNING order_id;
    `;
    const pedidoValues = [user_id, 'Pedido con varios productos', 'efectivo', 'Calle 123'];
  
    pool.query(pedidoQuery, pedidoValues, (err, res) => {
      if (err) return console.error('❌ Error al crear pedido:', err);
  
      const order_id = res.rows[0].order_id;
      console.log('🧾 Pedido creado con ID:', order_id);
  
      // 2. Insertar productos uno por uno
      productos.forEach(({ product_id, quantity }) => {
        const itemQuery = `
          INSERT INTO order_items (order_id, product_id, quantity)
          VALUES ($1, $2, $3);
        `;
        const itemValues = [order_id, product_id, quantity];
  
        pool.query(itemQuery, itemValues, (err) => {
          if (err) {
            console.error('❌ Error al insertar producto:', err);
          } else {
            console.log(`✅ Producto ${product_id} x${quantity} agregado al pedido`);
          }
        });
      });
    });
  }
  
  

crearUsuario('Mauricio', 'mauricio@email.com', 'miClave123');
iniciarSesion('mauricio@email.com', 'miClave123');
crearPedido(1, 'Sandwich cubano y jugo de guayaba', 'efectivo', 'Calle 9 sur #4-12');
obtenerPedidosDeUsuario(1);
crearPedidoConProductos(1, [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 1 },
    { product_id: 3, quantity: 1 }
  ]);
  



