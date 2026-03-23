import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Carga las variables de entorno del archivo .env
dotenv.config();

const app = express();

// Extrae los valores de tu archivo .env
const PORT = process.env.PORT || 3000;
const UA = process.env.USER_AGENT || 'LabUCSM/1.0 (laboratorio academico)';

// --- CONFIGURACIÓN DE BASE DE DATOS MONGODB ---
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('Conectado a la base de datos MongoDB'))
        .catch(err => console.error('Error conectando a MongoDB:', err));
}

// Modelo para guardar el historial de búsquedas
const HistorialSchema = new mongoose.Schema({
    tipo_busqueda: String,
    parametros: Object,
    fecha: { type: Date, default: Date.now }
});
const Historial = mongoose.model('Historial', HistorialSchema);
// ----------------------------------------------------

app.use(express.json());
app.use(express.static('public'));

// Helper fetch que usa el User-Agent
const osmFetch = url => fetch(url, { headers: { 'User-Agent': UA } }).then(r => r.json());

// Endpoint 1: Geocodificación Inversa (Nominatim)
app.get('/api/geocode', async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'Se requieren lat y lon' });

    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
        const data = await osmFetch(url);

        res.json({
            direccion: data.display_name,
            ciudad: data.address?.city || data.address?.town,
            pais: data.address?.country
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Endpoint 2: Ruta entre dos puntos (OSRM)
app.get('/api/ruta', async (req, res) => {
    const { oLat, oLon, dLat, dLon } = req.query;
    if (!oLat || !oLon || !dLat || !dLon) {
        return res.status(400).json({ error: 'Se requieren coordenadas de origen y destino' });
    }

    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${oLon},${oLat};${dLon},${dLat}?overview=false`;
        const data = await osmFetch(url);

        if (data.code !== 'Ok') return res.status(502).json({ error: data.code });

        const ruta = data.routes[0];

        // Guardamos la ruta en el historial de MongoDB
        if (process.env.MONGO_URI) {
            await Historial.create({ tipo_busqueda: 'Ruta', parametros: { oLat: parseFloat(oLat), oLon: parseFloat(oLon), dLat: parseFloat(dLat), dLon: parseFloat(dLon) } });
        }

        res.json({
            distancia_km: (ruta.distance / 1000).toFixed(2),
            duracion_min: (ruta.duration / 60).toFixed(1)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Endpoint 3: Obtener el historial de rutas
app.get('/api/historial', async (req, res) => {
    if (!process.env.MONGO_URI) {
        return res.status(501).json({ error: 'La base de datos no está configurada.' });
    }

    try {
        // Buscamos las últimas 10 rutas
        const rutas = await Historial.find({ tipo_busqueda: 'Ruta' })
                                     .sort({ fecha: -1 })
                                     .limit(10);
        res.json(rutas);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});