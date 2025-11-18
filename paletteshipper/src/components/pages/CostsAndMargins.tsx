import React, { useState, useEffect } from 'react';
import { Button, TextField, FormLabel, IconButton, Chip, Collapse, Box, Typography, Alert } from '@mui/material';
import FlightIcon from '@mui/icons-material/Flight';
import DirectionsBoatIcon from '@mui/icons-material/DirectionsBoat';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import DriveEtaIcon from '@mui/icons-material/DriveEta';
import HandymanIcon from '@mui/icons-material/Handyman';
import HomeIcon from '@mui/icons-material/Home';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ScheduleIcon from '@mui/icons-material/Schedule';
import WeekendIcon from '@mui/icons-material/Weekend';
import BuildIcon from '@mui/icons-material/Build';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import ShieldIcon from '@mui/icons-material/Shield';
import CheckroomIcon from '@mui/icons-material/Checkroom';
import DescriptionIcon from '@mui/icons-material/Description';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import BadgeIcon from '@mui/icons-material/Badge';
import NatureIcon from '@mui/icons-material/Nature';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useBids, useShipments } from '../../hooks/useStoreSelectors';
import useCurrency from '../../hooks/useCurrency';

interface SubLineItem {
  id: string;
  name: string;
  cost: number;
  margin: number;
  emoji?: string;
}

interface MainLineItem {
  id: string;
  name: string;
  subItems: SubLineItem[];
}

const CostsAndMargins = () => {
  // Get real bid and shipment data to calculate actual margins
  const { myBids } = useBids();
  const { assignedShipments } = useShipments();
  const { formatCurrency } = useCurrency();
  
  // Calculate actual metrics from real data
  const calculateActualMetrics = () => {
    const totalBids = myBids.length;
    const wonBids = myBids.filter(b => b.status === 'accepted').length;
    const totalRevenue = myBids
      .filter(b => b.status === 'accepted')
      .reduce((sum, b) => sum + (b.amount || 0), 0);
    
    const averageBidAmount = totalBids > 0 ? totalRevenue / wonBids : 0;
    const winRate = totalBids > 0 ? (wonBids / totalBids) * 100 : 0;
    
    return {
      totalBids,
      wonBids,
      totalRevenue,
      averageBidAmount,
      winRate
    };
  };
  
  const metrics = calculateActualMetrics();
  
  // Initialize with the same main categories from SubmitBid
  const [mainLineItems, setMainLineItems] = useState<MainLineItem[]>([
    {
      id: '1',
      name: 'Transport mode',
      subItems: [
        { id: 'air', name: 'Air Freight', cost: 2500, margin: 15 },
        { id: 'sea', name: 'Sea Freight', cost: 1200, margin: 20 },
        { id: 'courier', name: 'Express Courier', cost: 800, margin: 25 },
        { id: 'ground', name: 'Ground Transport', cost: 600, margin: 30 }
      ]
    },
    {
      id: '2',
      name: 'Collection & delivery services',
      subItems: [
        { id: 'white_glove', name: 'White Glove Service', cost: 450, margin: 35 },
        { id: 'standard', name: 'Standard Pickup/Delivery', cost: 200, margin: 40 },
        { id: 'curbside', name: 'Curbside Delivery', cost: 150, margin: 45 },
        { id: 'inside', name: 'Inside Delivery', cost: 300, margin: 25 },
        { id: 'appointment', name: 'Appointment Scheduling', cost: 75, margin: 50 },
        { id: 'weekend', name: 'Weekend Service', cost: 200, margin: 30 }
      ]
    },
    {
      id: '3',
      name: 'Packing & crating',
      subItems: [
        { id: 'professional', name: 'Professional Crating', cost: 650, margin: 20 },
        { id: 'bubble', name: 'Bubble Wrap & Padding', cost: 120, margin: 60 },
        { id: 'wooden', name: 'Custom Wooden Crates', cost: 800, margin: 15 },
        { id: 'climate', name: 'Climate-Controlled Packaging', cost: 350, margin: 30 },
        { id: 'fragile', name: 'Fragile Item Protection', cost: 250, margin: 40 },
        { id: 'soft', name: 'Soft Packing', cost: 180, margin: 45 }
      ]
    },
    {
      id: '4',
      name: 'Documentation & customs',
      subItems: [
        { id: 'export', name: 'Export Documentation', cost: 180, margin: 35 },
        { id: 'import', name: 'Import Clearance', cost: 220, margin: 30 },
        { id: 'insurance_cert', name: 'Insurance Certificates', cost: 95, margin: 50 },
        { id: 'customs', name: 'Customs Brokerage', cost: 320, margin: 25 },
        { id: 'carnet', name: 'ATA Carnet', cost: 150, margin: 40 },
        { id: 'cites', name: 'CITES Permits', cost: 200, margin: 35 }
      ]
    }
  ]);

  const [newSubItems, setNewSubItems] = useState<{[key: string]: { name: string; cost: string; margin: string; emoji?: string }}>({
    '1': { name: '', cost: '', margin: '', emoji: '' },
    '2': { name: '', cost: '', margin: '', emoji: '' },
    '3': { name: '', cost: '', margin: '', emoji: '' },
    '4': { name: '', cost: '', margin: '', emoji: '' }
  });

  // Icon mapping (to match SubmitBid.tsx visual style)
  const getSubItemIcon = (itemId: string): React.ReactElement => {
    const iconSx = { fontSize: 20, color: '#170849' } as const;
    const iconMap: Record<string, React.ReactElement> = {
      air: <FlightIcon sx={iconSx} />,
      sea: <DirectionsBoatIcon sx={iconSx} />,
      courier: <LocalShippingOutlinedIcon sx={iconSx} />,
      ground: <DriveEtaIcon sx={iconSx} />,

      white_glove: <HandymanIcon sx={iconSx} />,
      standard: <HomeIcon sx={iconSx} />,
      curbside: <LocationOnIcon sx={iconSx} />,
      inside: <HomeIcon sx={iconSx} />,
      appointment: <ScheduleIcon sx={iconSx} />,
      weekend: <WeekendIcon sx={iconSx} />,

      professional: <BuildIcon sx={iconSx} />,
      bubble: <BubbleChartIcon sx={iconSx} />,
      wooden: <Inventory2Icon sx={iconSx} />,
      climate: <ThermostatIcon sx={iconSx} />,
      fragile: <ShieldIcon sx={iconSx} />,
      soft: <CheckroomIcon sx={iconSx} />,

      export: <DescriptionIcon sx={iconSx} />,
      import: <ImportExportIcon sx={iconSx} />,
      insurance_cert: <VerifiedUserIcon sx={iconSx} />,
      customs: <AccountBalanceIcon sx={iconSx} />,
      carnet: <BadgeIcon sx={iconSx} />,
      cites: <NatureIcon sx={iconSx} />
    };
    return iconMap[itemId] || <Inventory2Icon sx={iconSx} />;
  };

  // Default emoji mapping for known sub-item ids
  const getDefaultEmojiForSubItem = (itemId: string): string => {
    const emojiMap: Record<string, string> = {
      // Transport mode
      air: '✈️',
      sea: '🚢',
      courier: '🚚',
      ground: '🚛',

      // Collection & delivery services
      white_glove: '🧤',
      standard: '🏠',
      curbside: '📍',
      inside: '🏡',
      appointment: '🕒',
      weekend: '📅',

      // Packing & crating
      professional: '🛠️',
      bubble: '🫧',
      wooden: '📦',
      climate: '❄️',
      fragile: '🛡️',
      soft: '🧥',

      // Documentation & customs
      export: '📤',
      import: '📥',
      insurance_cert: '✅',
      customs: '🏛️',
      carnet: '🎫',
      cites: '🌿',
    };
    return emojiMap[itemId] || '📦';
  };

  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({
    '1': true,
    '2': false,
    '3': false,
    '4': false
  });

  const handleSubItemChange = (mainItemId: string, subItemId: string, field: 'name' | 'cost' | 'margin' | 'emoji', value: string | number) => {
    setMainLineItems(prev => prev.map(mainItem => {
      if (mainItem.id === mainItemId) {
        return {
          ...mainItem,
          subItems: mainItem.subItems.map(subItem => {
            if (subItem.id === subItemId) {
              return { ...subItem, [field]: value };
            }
            return subItem;
          })
        };
      }
      return mainItem;
    }));
  };

  const addSubItem = (mainItemId: string) => {
    const newItem = newSubItems[mainItemId];
    if (newItem.name.trim() && newItem.cost && newItem.margin) {
      const subItem: SubLineItem = {
        id: `${mainItemId}_${Date.now()}`,
        name: newItem.name.trim(),
        cost: parseFloat(newItem.cost),
        margin: parseFloat(newItem.margin),
        emoji: newItem.emoji || undefined
      };

      setMainLineItems(prev => prev.map(mainItem => {
        if (mainItem.id === mainItemId) {
          return {
            ...mainItem,
            subItems: [...mainItem.subItems, subItem]
          };
        }
        return mainItem;
      }));

      // Reset the form
      setNewSubItems(prev => ({
        ...prev,
        [mainItemId]: { name: '', cost: '', margin: '', emoji: '' }
      }));
    }
  };

  const deleteSubItem = (mainItemId: string, subItemId: string) => {
    setMainLineItems(prev => prev.map(mainItem => {
      if (mainItem.id === mainItemId) {
        return {
          ...mainItem,
          subItems: mainItem.subItems.filter(subItem => subItem.id !== subItemId)
        };
      }
      return mainItem;
    }));
  };

  const handleNewSubItemChange = (mainItemId: string, field: 'name' | 'cost' | 'margin' | 'emoji', value: string) => {
    setNewSubItems(prev => ({
      ...prev,
      [mainItemId]: { ...prev[mainItemId], [field]: value }
    }));
  };

  const calculateSellingPrice = (cost: number, margin: number) => {
    return cost * (1 + margin / 100);
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log('Saving costs and margins:', mainLineItems);
      alert('Costs and margins saved successfully!');
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="main-wrap">
      <div className="main-panel">
        <header className="header">
          <div className="header-row">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <h1 className="header-title">Costs & Margins Management</h1>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={saving}
                sx={{
                  background: '#8412ff',
                  color: '#ffffff',
                  textTransform: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  padding: '8px 16px',
                  '&:hover': {
                    background: '#730add',
                  },
                  '&:disabled': {
                    background: '#ccc',
                    color: '#999'
                  }
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </header>
        
        <div className="main-content" style={{ flexDirection: 'column', gap: '32px' }}>
          {/* Real Data Metrics Section */}
          <Box sx={{ marginBottom: '32px' }}>
            <Typography variant="h6" sx={{ fontFamily: 'Fractul', marginBottom: '16px', color: '#170849' }}>
              Performance Metrics (Based on Actual Data)
            </Typography>
            {metrics.totalBids === 0 ? (
              <Alert severity="info">
                No bid data available yet. Submit bids to see performance metrics.
              </Alert>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <Box sx={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                  <Typography variant="h4" sx={{ fontFamily: 'Fractul', color: '#8412ff' }}>
                    {metrics.totalBids}
                  </Typography>
                  <Typography variant="body2">Total Bids Submitted</Typography>
                </Box>
                <Box sx={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                  <Typography variant="h4" sx={{ fontFamily: 'Fractul', color: '#00AAAB' }}>
                    {metrics.wonBids}
                  </Typography>
                  <Typography variant="body2">Bids Won</Typography>
                </Box>
                <Box sx={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                  <Typography variant="h4" sx={{ fontFamily: 'Fractul', color: '#0DAB71' }}>
                    {metrics.winRate.toFixed(1)}%
                  </Typography>
                  <Typography variant="body2">Win Rate</Typography>
                </Box>
                <Box sx={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                  <Typography variant="h4" sx={{ fontFamily: 'Fractul', color: '#E9932D' }}>
                    {formatCurrency(metrics.averageBidAmount)}
                  </Typography>
                  <Typography variant="body2">Avg Winning Bid</Typography>
                </Box>
                <Box sx={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                  <Typography variant="h4" sx={{ fontFamily: 'Fractul', color: '#170849' }}>
                    {formatCurrency(metrics.totalRevenue)}
                  </Typography>
                  <Typography variant="body2">Total Revenue</Typography>
                </Box>
              </Box>
            )}
          </Box>
          
          <div className="chart-card">
            <div className="chart-header">
              <h4>Service Categories & Pricing</h4>
            </div>
            <div style={{ padding: '24px' }}>
              <div style={{ fontSize: '14px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '24px' }}>
                Manage your service costs and profit margins. Changes will be reflected in future quotes and bids.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                {mainLineItems.map((mainItem) => (
                  <div 
                    key={mainItem.id} 
                    className="detail-card"
                    style={{
                      transition: 'all 0.3s ease',
                      transform: expandedSections[mainItem.id] ? 'scale(1)' : 'scale(0.99)',
                      opacity: expandedSections[mainItem.id] ? 1 : 0.95
                    }}
                  >
                    <Box 
                      onClick={() => toggleSection(mainItem.id)}
                      sx={{
                        padding: '20px 24px 12px', 
                        borderBottom: '1px solid #e9eaeb',
                        background: 'linear-gradient(135deg, rgba(132, 18, 255, 0.05) 0%, rgba(132, 18, 255, 0.02) 100%)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        '&:hover': {
                          background: 'linear-gradient(135deg, rgba(132, 18, 255, 0.08) 0%, rgba(132, 18, 255, 0.04) 100%)',
                          transform: 'translateY(-1px)',
                          boxShadow: '0 2px 8px rgba(132, 18, 255, 0.15)'
                        }
                      }}
                    >
                      <h3 style={{ 
                        margin: 0, 
                        fontSize: '18px', 
                        fontWeight: 600, 
                        color: '#170849',
                        fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
                      }}>
                        {mainItem.name}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ 
                          fontSize: '12px', 
                          color: '#666',
                          fontWeight: 500
                        }}>
                          {mainItem.subItems.length} services
                        </span>
                        <ExpandMoreIcon 
                          sx={{ 
                            color: '#8412ff',
                            transition: 'transform 0.3s ease',
                            transform: expandedSections[mainItem.id] ? 'rotate(180deg)' : 'rotate(0deg)'
                          }} 
                                                 />
                       </div>
                                          </Box>
                     
                     {/* Collapsed Preview */}
                     <Collapse in={!expandedSections[mainItem.id]} timeout={200}>
                       <div style={{ 
                         padding: '16px 24px',
                         background: '#f8f9fa',
                         borderTop: '1px solid #e9eaeb'
                       }}>
                         <div style={{ 
                           display: 'flex',
                           justifyContent: 'space-between',
                           alignItems: 'center',
                           fontSize: '14px',
                           color: '#666'
                         }}>
                           <span>Cost range: ${Math.min(...mainItem.subItems.map(item => item.cost))} - ${Math.max(...mainItem.subItems.map(item => item.cost))}</span>
                           <span>Avg margin: {(mainItem.subItems.reduce((sum, item) => sum + item.margin, 0) / mainItem.subItems.length).toFixed(1)}%</span>
                         </div>
                       </div>
                     </Collapse>
                     
                     <Collapse in={expandedSections[mainItem.id]} timeout={300}>
                      <div style={{ padding: '24px' }}>
                        {/* Existing Sub Items */}
                        <div style={{ marginBottom: '24px' }}>
                          <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'minmax(240px, 1fr) 120px 120px 120px 60px', 
                            gap: '12px',
                            alignItems: 'center',
                            padding: '12px 16px',
                            background: '#f8f9fa',
                            borderRadius: '8px',
                            marginBottom: '16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#666',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            <div>Service</div>
                            <div>Base Cost ($)</div>
                            <div>Margin (%)</div>
                            <div>Selling Price ($)</div>
                            <div></div>
                          </div>

                        {mainItem.subItems.map((subItem) => (
                          <div key={subItem.id} style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'minmax(240px, 1fr) 120px 120px 120px 60px', 
                            gap: '12px',
                            alignItems: 'center',
                            padding: '12px 16px',
                            marginBottom: '12px',
                            border: '1px solid #e9eaeb',
                            borderRadius: '10px',
                            background: '#fff',
                            transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 8,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: 'rgba(132, 18, 255, 0.1)',
                                  color: '#170849'
                                }}
                              >
                                {subItem.emoji ? (
                                  <span style={{ fontSize: 18, filter: 'grayscale(1) saturate(0)' }}>{subItem.emoji}</span>
                                ) : (
                                  getSubItemIcon(subItem.id)
                                )}
                              </div>
                              <TextField
                                value={subItem.name}
                                onChange={(e) => handleSubItemChange(mainItem.id, subItem.id, 'name', e.target.value)}
                                size="small"
                                sx={{
                                  '& .MuiOutlinedInput-root': {
                                    '& fieldset': { borderColor: 'transparent' },
                                    '&:hover fieldset': { borderColor: 'transparent' },
                                    '&.Mui-focused fieldset': { borderColor: '#8412ff' }
                                  },
                                  '& .MuiOutlinedInput-input': {
                                    fontWeight: 600,
                                    color: '#170849'
                                  }
                                }}
                              />
                            </div>
                            
                            <TextField
                              type="number"
                              value={subItem.cost}
                              onChange={(e) => handleSubItemChange(mainItem.id, subItem.id, 'cost', parseFloat(e.target.value) || 0)}
                              size="small"
                              inputProps={{ min: 0, step: 0.01 }}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  '& fieldset': { borderColor: '#e9eaeb' },
                                  '&:hover fieldset': { borderColor: '#8412ff' },
                                  '&.Mui-focused fieldset': { borderColor: '#8412ff' }
                                },
                                '& input[type=number]': {
                                  '-moz-appearance': 'textfield'
                                },
                                '& input[type=number]::-webkit-outer-spin-button': {
                                  '-webkit-appearance': 'none',
                                  margin: 0
                                },
                                '& input[type=number]::-webkit-inner-spin-button': {
                                  '-webkit-appearance': 'none',
                                  margin: 0
                                }
                              }}
                            />
                            
                            <TextField
                              type="number"
                              value={subItem.margin}
                              onChange={(e) => handleSubItemChange(mainItem.id, subItem.id, 'margin', parseFloat(e.target.value) || 0)}
                              size="small"
                              inputProps={{ min: 0, max: 1000, step: 0.1 }}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  '& fieldset': { borderColor: '#e9eaeb' },
                                  '&:hover fieldset': { borderColor: '#8412ff' },
                                  '&.Mui-focused fieldset': { borderColor: '#8412ff' }
                                },
                                '& input[type=number]': {
                                  '-moz-appearance': 'textfield'
                                },
                                '& input[type=number]::-webkit-outer-spin-button': {
                                  '-webkit-appearance': 'none',
                                  margin: 0
                                },
                                '& input[type=number]::-webkit-inner-spin-button': {
                                  '-webkit-appearance': 'none',
                                  margin: 0
                                }
                              }}
                            />
                            
                            <div style={{ 
                              fontSize: '14px', 
                              fontWeight: 600, 
                              color: '#8412ff',
                              textAlign: 'center'
                            }}>
                              ${calculateSellingPrice(subItem.cost, subItem.margin).toFixed(2)}
                            </div>
                            
                            <IconButton
                              onClick={() => deleteSubItem(mainItem.id, subItem.id)}
                              size="small"
                              sx={{ 
                                color: '#999', 
                                '&:hover': { 
                                  color: '#f44336',
                                  background: 'rgba(244, 67, 54, 0.05)'
                                } 
                              }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </div>
                        ))}
                      </div>

                      {/* Add New Sub Item */}
                        <div style={{ 
                          border: '2px dashed #e9eaeb',
                          borderRadius: '8px',
                          padding: '20px',
                          background: '#fafafa'
                        }}>
                        <FormLabel style={{ 
                          fontSize: '14px', 
                          color: '#170849', 
                          marginBottom: '12px',
                          fontWeight: 600,
                          display: 'block'
                        }}>
                          Add New Service
                        </FormLabel>
                        
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1fr 120px 120px auto', 
                          gap: '12px',
                          alignItems: 'end'
                        }}>
                          <TextField
                            label="Service Name"
                            value={newSubItems[mainItem.id].name}
                            onChange={(e) => handleNewSubItemChange(mainItem.id, 'name', e.target.value)}
                            size="small"
                            placeholder="Enter service name..."
                          />
                          
                          <TextField
                            label="Base Cost ($)"
                            type="number"
                            value={newSubItems[mainItem.id].cost}
                            onChange={(e) => handleNewSubItemChange(mainItem.id, 'cost', e.target.value)}
                            size="small"
                            inputProps={{ min: 0, step: 0.01 }}
                            sx={{
                              '& input[type=number]': {
                                '-moz-appearance': 'textfield'
                              },
                              '& input[type=number]::-webkit-outer-spin-button': {
                                '-webkit-appearance': 'none',
                                margin: 0
                              },
                              '& input[type=number]::-webkit-inner-spin-button': {
                                '-webkit-appearance': 'none',
                                margin: 0
                              }
                            }}
                          />
                          
                          <TextField
                            label="Margin (%)"
                            type="number"
                            value={newSubItems[mainItem.id].margin}
                            onChange={(e) => handleNewSubItemChange(mainItem.id, 'margin', e.target.value)}
                            size="small"
                            inputProps={{ min: 0, max: 1000, step: 0.1 }}
                            sx={{
                              '& input[type=number]': {
                                '-moz-appearance': 'textfield'
                              },
                              '& input[type=number]::-webkit-outer-spin-button': {
                                '-webkit-appearance': 'none',
                                margin: 0
                              },
                              '& input[type=number]::-webkit-inner-spin-button': {
                                '-webkit-appearance': 'none',
                                margin: 0
                              }
                            }}
                          />
                          
                          <Button
                            onClick={() => addSubItem(mainItem.id)}
                            disabled={!newSubItems[mainItem.id].name.trim() || !newSubItems[mainItem.id].cost || !newSubItems[mainItem.id].margin}
                            variant="contained"
                            startIcon={<AddIcon />}
                            sx={{
                              background: '#8412ff',
                              color: '#ffffff',
                              textTransform: 'none',
                              fontSize: '14px',
                              fontWeight: 600,
                              padding: '8px 16px',
                              '&:hover': {
                                background: '#730add',
                              },
                              '&:disabled': {
                                background: '#ccc',
                                color: '#999'
                              }
                            }}
                          >
                            Add
                          </Button>
                        </div>

                          {/* Emoji selector */}
                          <div style={{ marginTop: '12px' }}>
                            <FormLabel style={{ 
                              fontSize: '12px', 
                              color: '#170849', 
                              marginBottom: '8px',
                              fontWeight: 600,
                              display: 'block'
                            }}>
                              Choose an emoji (optional)
                            </FormLabel>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                              {['✈️','🚢','🚚','🚛','🧤','📍','🏡','🕒','📅','🛠️','🫧','📦','❄️','🛡️','🧥','📤','📥','✅','🏛️','🎫','🌿','🚐','🧳','🧰'].map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  aria-label={`Choose ${emoji}`}
                                  onClick={() => handleNewSubItemChange(mainItem.id, 'emoji', emoji)}
                                  style={{
                                    width: 36,
                                    height: 36,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: 8,
                                    border: newSubItems[mainItem.id].emoji === emoji ? '2px solid #8412ff' : '1px solid #e9eaeb',
                                    background: 'rgba(132, 18, 255, 0.1)',
                                    color: '#170849',
                                    cursor: 'pointer',
                                    fontSize: 18,
                                    lineHeight: 1,
                                    padding: 0,
                                    transition: 'border-color 0.15s ease, transform 0.05s ease'
                                  }}
                                >
                                  <span style={{ filter: 'grayscale(1) saturate(0)' }}>{emoji}</span>
                                </button>
                              ))}
                              <TextField
                                label="Custom emoji"
                                placeholder="e.g. 🚛"
                                size="small"
                                value={newSubItems[mainItem.id].emoji || ''}
                                onChange={(e) => handleNewSubItemChange(mainItem.id, 'emoji', e.target.value)}
                                sx={{ width: 120 }}
                              />
                            </div>
                          </div>
                        
                        {newSubItems[mainItem.id].cost && newSubItems[mainItem.id].margin && (
                          <div style={{ 
                            marginTop: '12px',
                            fontSize: '14px',
                            color: '#666'
                          }}>
                            <strong>Preview Selling Price: </strong>
                            <span style={{ color: '#8412ff', fontWeight: 600 }}>
                              {formatCurrency(
                                calculateSellingPrice(
                                  parseFloat(newSubItems[mainItem.id].cost) || 0,
                                  parseFloat(newSubItems[mainItem.id].margin) || 0
                                ),
                                { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                              )}
                            </span>
                          </div>
                        )}
                        </div>
                      </div>
                    </Collapse>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CostsAndMargins; 
