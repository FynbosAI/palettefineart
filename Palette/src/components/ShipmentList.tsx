import React, { useState } from 'react';
import { useShipments } from '../hooks/useStoreSelectors';
import ShipmentCard from './ShipmentCard';

const ShipmentList = () => {
  const { shipments, selectedShipmentId, selectShipment } = useShipments();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredShipments = shipments.filter(shipment =>
    shipment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    shipment.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="card-stack shipment-list-column">
        <div className="shipment-list-header">
            <input 
              type="text" 
              placeholder="Search shipments..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <div className="shipment-list-items">
            {filteredShipments.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                {searchTerm ? 'No shipments found matching your search.' : 'No shipments available.'}
              </div>
            ) : (
              filteredShipments.map((shipment) => (
                <ShipmentCard 
                    key={shipment.id} 
                    id={shipment.id}
                    code={shipment.code}
                    name={shipment.name}
                    status={shipment.status}
                    estimatedArrival={shipment.estimated_arrival}
                    artworkCount={shipment.artworks?.length || 0}
                    totalValue={shipment.artworks?.reduce((sum, art) => sum + (art.declared_value || 0), 0) || 0}
                    originName={shipment.origin?.name}
                    destinationName={shipment.destination?.name}
                />
              ))
            )}
        </div>
    </div>
  );
};

export default ShipmentList; 