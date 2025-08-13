import React from 'react';
import { useParams } from 'react-router-dom';

const FineDetails = () => {
  const { id } = useParams();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Fine Details</h1>
        <p className="text-gray-600">Fine ID: {id}</p>
        <p className="text-sm text-gray-500 mt-4">
          This page will show detailed information about the traffic fine, including:
        </p>
        <ul className="list-disc list-inside text-sm text-gray-500 mt-2 space-y-1">
          <li>Violation details and description</li>
          <li>Location with Google Maps integration</li>
          <li>Vehicle information</li>
          <li>Payment status and history</li>
          <li>Officer information</li>
          <li>Evidence photos/documents</li>
        </ul>
      </div>
    </div>
  );
};

export default FineDetails;