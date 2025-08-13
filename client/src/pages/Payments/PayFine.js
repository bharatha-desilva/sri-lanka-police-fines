import React from 'react';
import { useParams } from 'react-router-dom';

const PayFine = () => {
  const { id } = useParams();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Pay Fine</h1>
        <p className="text-gray-600 mb-6">Fine ID: {id}</p>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-lg font-medium text-green-900 mb-2">Stripe Payment Integration</h3>
          <p className="text-sm text-green-700 mb-4">
            This page will integrate with Stripe Elements to provide secure payment processing:
          </p>
          <ul className="list-disc list-inside text-sm text-green-700 space-y-1">
            <li>Fine details and amount display</li>
            <li>Stripe Elements payment form</li>
            <li>Payment confirmation and receipt</li>
            <li>Payment status updates</li>
            <li>Error handling and validation</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PayFine;