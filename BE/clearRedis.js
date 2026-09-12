const { createClient } = require('redis');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

(async () => {
  const client = createClient({ url: redisUrl });
  client.on('error', (err) => {
    console.error('Redis Error:', err.message);
    process.exit(1);
  });

  await client.connect();
  console.log('Ket noi Redis: ' + redisUrl);

  const patterns = ['guest:rate:*', 'guest:salt:*'];
  let total = 0;

  for (const pattern of patterns) {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
      total += keys.length;
      console.log('Da xoa ' + keys.length + ' keys - ' + pattern);
    } else {
      console.log('Khong co keys: ' + pattern);
    }
  }

  console.log('Tong xoa: ' + total + ' keys');
  await client.quit();
  process.exit(0);
})().catch(err => {
  console.error('Loi:', err.message);
  process.exit(1);
});
