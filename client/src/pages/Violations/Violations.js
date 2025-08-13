import React from 'react';
import { useQuery } from 'react-query';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import axios from 'axios';

const Violations = () => {
  const { data: violations, isLoading, error } = useQuery(
    'violations',
    () => axios.get('/api/violations').then((res) => res.data.violations),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'Minor':
        return 'bg-gray-100 text-gray-800';
      case 'Low':
        return 'bg-yellow-100 text-yellow-800';
      case 'Severe':
        return 'bg-red-100 text-red-800';
      case 'DeathSevere':
        return 'bg-red-900 text-white';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount, currency = 'LKR') => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" text="Loading violations..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Violations</h3>
        <p className="text-gray-500">{error.response?.data?.message || 'Something went wrong'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Traffic Violations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse traffic violation types and their associated penalties
        </p>
      </div>

      {/* Violations Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {violations?.map((violation) => (
          <div key={violation._id} className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <ExclamationTriangleIcon className="h-6 w-6 text-orange-500 mr-2" />
                  <h3 className="text-lg font-medium text-gray-900">{violation.name}</h3>
                </div>
                <span
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSeverityColor(
                    violation.severityLevel
                  )}`}
                >
                  {violation.severityLevel}
                </span>
              </div>
              
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-gray-500">Code:</span>
                  <span className="ml-2 text-sm text-gray-900">{violation.code}</span>
                </div>
                
                <div>
                  <span className="text-sm font-medium text-gray-500">Category:</span>
                  <span className="ml-2 text-sm text-gray-900">{violation.category}</span>
                </div>
                
                <div>
                  <span className="text-sm font-medium text-gray-500">Fine Amount:</span>
                  <span className="ml-2 text-sm font-semibold text-green-600">
                    {formatCurrency(violation.fineAmount, violation.currency)}
                  </span>
                </div>
                
                {violation.points > 0 && (
                  <div>
                    <span className="text-sm font-medium text-gray-500">Points:</span>
                    <span className="ml-2 text-sm text-gray-900">{violation.points}</span>
                  </div>
                )}
                
                {violation.description && (
                  <div>
                    <span className="text-sm font-medium text-gray-500">Description:</span>
                    <p className="mt-1 text-sm text-gray-600">{violation.description}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {violations?.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No violations found</h3>
          <p className="mt-1 text-sm text-gray-500">
            No traffic violations have been configured yet.
          </p>
        </div>
      )}
    </div>
  );
};

export default Violations;