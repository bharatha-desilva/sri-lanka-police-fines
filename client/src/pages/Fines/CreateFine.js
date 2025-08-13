import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import { useNavigate } from 'react-router-dom';

const VEHICLE_TYPES = ['Car', 'Motorcycle', 'Bus', 'Truck', 'Van', 'Three-Wheeler', 'Other'];

const CreateFine = () => {
	const { user, isPoliceOfficer, isAdmin } = useAuth();
	const navigate = useNavigate();

	useEffect(() => {
		if (!isPoliceOfficer() && !isAdmin()) {
			navigate('/fines');
		}
	}, [isPoliceOfficer, isAdmin, navigate]);

	// Fetch active violations for dropdown
	const { data: violationsData, isLoading: isLoadingViolations } = useQuery(
		['violations', 'active'],
		() => axios.get('/api/violations').then((res) => res.data),
		{ staleTime: 5 * 60 * 1000 }
	);

	const violations = violationsData?.violations || [];

	// Driver search (police/admin only)
	const [driverQuery, setDriverQuery] = useState('');
	const [selectedDriver, setSelectedDriver] = useState(null);
	const debouncedQuery = useDebounce(driverQuery, 300);
	const { data: driverSearchData, isLoading: isSearchingDrivers } = useQuery(
		['drivers-search', debouncedQuery],
		() => axios.get(`/api/users/search/drivers?q=${encodeURIComponent(debouncedQuery)}`).then((r) => r.data),
		{ enabled: !!debouncedQuery && (isPoliceOfficer() || isAdmin()) }
	);

	const drivers = driverSearchData?.drivers || [];

	const defaultValues = useMemo(() => ({
		violationId: '',
		customFineAmount: '',
		violationMessage: '',
		location: {
			googleLocation: { lat: '', lng: '' },
			address: '',
			city: '',
			province: '',
		},
		vehicleInfo: {
			licensePlate: '',
			vehicleType: '',
			make: '',
			model: '',
			color: '',
		},
		tagsInput: '',
	}), []);

	const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({ defaultValues });

	const watchedViolationId = watch('violationId');
	const selectedViolation = useMemo(() => violations.find(v => v._id === watchedViolationId), [violations, watchedViolationId]);

	useEffect(() => {
		if (selectedViolation) {
			// Pre-fill license plate if previously empty? No. Only show default amount info.
		}
	}, [selectedViolation]);

	const createFineMutation = useMutation(
		(payload) => axios.post('/api/fines', payload).then((r) => r.data),
		{
			onSuccess: (data) => {
				toast.success('Fine created successfully');
				navigate(`/fines/${data.fine._id}`);
			},
			onError: (error) => {
				toast.error(error.response?.data?.message || 'Failed to create fine');
			},
		}
	);

	const onSubmit = (form) => {
		if (!selectedDriver?._id) {
			toast.error('Please select a driver');
			return;
		}
		if (!selectedViolation?._id) {
			toast.error('Please select a violation');
			return;
		}

		const tags = (form.tagsInput || '')
			.split(',')
			.map(t => t.trim())
			.filter(Boolean);

		const payload = {
			driverId: selectedDriver._id,
			violationId: selectedViolation._id,
			violationMessage: form.violationMessage,
			location: {
				googleLocation: {
					lat: parseFloat(form.location.googleLocation.lat),
					lng: parseFloat(form.location.googleLocation.lng),
				},
				address: form.location.address || undefined,
				city: form.location.city || undefined,
				province: form.location.province || undefined,
			},
			vehicleInfo: {
				licensePlate: form.vehicleInfo.licensePlate,
				vehicleType: form.vehicleInfo.vehicleType,
				make: form.vehicleInfo.make || undefined,
				model: form.vehicleInfo.model || undefined,
				color: form.vehicleInfo.color || undefined,
			},
			tags: tags.length ? tags : undefined,
			customFineAmount: form.customFineAmount ? Number(form.customFineAmount) : undefined,
		};

		createFineMutation.mutate(payload);
	};

	return (
		<div className="max-w-4xl mx-auto">
			<div className="bg-white shadow rounded-lg p-6">
				<h1 className="text-2xl font-bold text-gray-900 mb-1">Create Traffic Fine</h1>
				<p className="text-gray-600 mb-6">
					Officer: {user?.fullName || user?.username} ({user?.profile?.badgeNumber})
				</p>

				<form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
					{/* Driver Selection */}
					<div>
						<h2 className="text-lg font-semibold text-gray-900 mb-3">Driver</h2>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
							<div className="md:col-span-2">
								<label className="block text-sm font-medium text-gray-700 mb-1">Search driver</label>
								<input
									type="text"
									className="form-input w-full"
									placeholder="Name, username, email, license number"
									value={driverQuery}
									onChange={(e) => {
										setDriverQuery(e.target.value);
									}}
								/>
								{isSearchingDrivers && <LoadingSpinner size="sm" className="mt-2" />}
								{drivers.length > 0 && driverQuery && (
									<div className="mt-2 border rounded-md divide-y max-h-56 overflow-auto">
										{drivers.map((d) => (
											<button
												key={d._id}
												type="button"
												className="w-full text-left px-3 py-2 hover:bg-gray-50"
												onClick={() => {
													setSelectedDriver(d);
													setDriverQuery('');
												}}
											>
												<span className="font-medium">{d.profile?.firstName} {d.profile?.lastName}</span>
												<span className="text-gray-500 text-sm"> — {d.username} · {d.email}</span>
												{d.profile?.licenseNumber && (
													<span className="ml-1 text-xs text-gray-400">({d.profile.licenseNumber})</span>
												)}
											</button>
										))}
									</div>
								)}
							</div>
							<div className="md:col-span-1">
								<label className="block text-sm font-medium text-gray-700 mb-1">Selected driver</label>
								<div className="p-3 border rounded-md min-h-[44px]">
									{selectedDriver ? (
										<div className="text-sm">
											<div className="font-medium">{selectedDriver.profile?.firstName} {selectedDriver.profile?.lastName}</div>
											<div className="text-gray-500">{selectedDriver.username} · {selectedDriver.email}</div>
										</div>
									) : (
										<span className="text-gray-400">None</span>
									)}
								</div>
							</div>
						</div>
					</div>

					{/* Violation and Amount */}
					<div>
						<h2 className="text-lg font-semibold text-gray-900 mb-3">Violation & Amount</h2>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Violation</label>
								{isLoadingViolations ? (
									<LoadingSpinner size="sm" />
								) : (
									<select
										className="form-select w-full"
										{...register('violationId', { required: 'Violation is required' })}
										defaultValue=""
									>
										<option value="" disabled>Select a violation</option>
										{violations.map((v) => (
											<option key={v._id} value={v._id}>
												{v.category} — {v.name} ({v.code})
											</option>
										))}
									</select>
								)}
								{errors.violationId && (
									<p className="mt-1 text-sm text-red-600">{errors.violationId.message}</p>
								)}
								{selectedViolation && (
									<p className="mt-2 text-xs text-gray-500">Default amount: {new Intl.NumberFormat('en-LK', { style: 'currency', currency: selectedViolation.currency || 'LKR' }).format(selectedViolation.fineAmount)}</p>
								)}
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Custom amount (optional)</label>
								<input
									type="number"
									step="0.01"
									min="0"
									className="form-input w-full"
									placeholder="Leave empty to use default"
									{...register('customFineAmount', { min: { value: 0, message: 'Amount must be positive' } })}
								/>
								{errors.customFineAmount && (
									<p className="mt-1 text-sm text-red-600">{errors.customFineAmount.message}</p>
								)}
							</div>
						</div>
					</div>

					{/* Violation message */}
					<div>
						<h2 className="text-lg font-semibold text-gray-900 mb-3">Details</h2>
						<label className="block text-sm font-medium text-gray-700 mb-1">Violation message</label>
						<textarea
							rows={3}
							className="form-input w-full"
							placeholder="Describe the incident briefly"
							{...register('violationMessage', { required: 'Message is required', maxLength: { value: 1000, message: 'Max 1000 characters' } })}
						/>
						{errors.violationMessage && (
							<p className="mt-1 text-sm text-red-600">{errors.violationMessage.message}</p>
						)}
					</div>

					{/* Location */}
					<div>
						<h2 className="text-lg font-semibold text-gray-900 mb-3">Location</h2>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
								<input
									type="number"
									step="0.000001"
									className="form-input w-full"
									{...register('location.googleLocation.lat', { required: 'Latitude is required', min: { value: -90, message: '>= -90' }, max: { value: 90, message: '<= 90' } })}
								/>
								{errors.location?.googleLocation?.lat && (
									<p className="mt-1 text-sm text-red-600">{errors.location.googleLocation.lat.message}</p>
								)}
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
								<input
									type="number"
									step="0.000001"
									className="form-input w-full"
									{...register('location.googleLocation.lng', { required: 'Longitude is required', min: { value: -180, message: '>= -180' }, max: { value: 180, message: '<= 180' } })}
								/>
								{errors.location?.googleLocation?.lng && (
									<p className="mt-1 text-sm text-red-600">{errors.location.googleLocation.lng.message}</p>
								)}
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Address (optional)</label>
								<input type="text" className="form-input w-full" {...register('location.address')} />
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">City (optional)</label>
								<input type="text" className="form-input w-full" {...register('location.city')} />
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Province (optional)</label>
								<input type="text" className="form-input w-full" {...register('location.province')} />
							</div>
						</div>
					</div>

					{/* Vehicle */}
					<div>
						<h2 className="text-lg font-semibold text-gray-900 mb-3">Vehicle</h2>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">License plate</label>
								<input
									type="text"
									className="form-input w-full"
									{...register('vehicleInfo.licensePlate', { required: 'License plate is required' })}
								/>
								{errors.vehicleInfo?.licensePlate && (
									<p className="mt-1 text-sm text-red-600">{errors.vehicleInfo.licensePlate.message}</p>
								)}
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Vehicle type</label>
								<select
									className="form-select w-full"
									defaultValue=""
									{...register('vehicleInfo.vehicleType', { required: 'Vehicle type is required' })}
								>
									<option value="" disabled>Select a type</option>
									{VEHICLE_TYPES.map((t) => (
										<option key={t} value={t}>{t}</option>
									))}
								</select>
								{errors.vehicleInfo?.vehicleType && (
									<p className="mt-1 text-sm text-red-600">{errors.vehicleInfo.vehicleType.message}</p>
								)}
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Make (optional)</label>
								<input type="text" className="form-input w-full" {...register('vehicleInfo.make')} />
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Model (optional)</label>
								<input type="text" className="form-input w-full" {...register('vehicleInfo.model')} />
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Color (optional)</label>
								<input type="text" className="form-input w-full" {...register('vehicleInfo.color')} />
							</div>
						</div>
					</div>

					{/* Tags */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated, optional)</label>
						<input type="text" className="form-input w-full" placeholder="e.g., speeding, highway" {...register('tagsInput')} />
					</div>

					<div className="pt-2 flex items-center justify-end gap-3">
						<button
							type="button"
							className="btn-secondary"
							onClick={() => navigate('/fines')}
						>
							Cancel
						</button>
						<button
							type="submit"
							className="btn-primary"
							disabled={isSubmitting || createFineMutation.isLoading}
						>
							{(isSubmitting || createFineMutation.isLoading) ? 'Creating...' : 'Create Fine'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

function useDebounce(value, delay) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const handler = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(handler);
	}, [value, delay]);
	return debounced;
}

export default CreateFine;